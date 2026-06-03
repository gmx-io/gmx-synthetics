// Runs checkMarketBalanceHealth.ts on each network and posts a Telegram alert
// when any market is flagged (❌ broken / ⚠️ claims will revert) or when a run fails.
// Meant to be run once per cron tick by PM2 (see ecosystem.config.js).

require("dotenv").config();

const { spawnSync } = require("child_process");

const TELEGRAM_API = "https://api.telegram.org";
const RUN_TIMEOUT_MS = 5 * 60 * 1000; // kill a hung hardhat run so a stuck RPC can't dark the tick until the next cron
const CODE_BLOCK_MAX = 3500; // keep each message under Telegram's 4096 limit, with room for the prefix + fences

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const NETWORKS = (process.env.MONITOR_NETWORKS || "arbitrum,avalanche,botanix,megaEth")
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);
const MONITOR_SCRIPT = process.env.MONITOR_SCRIPT || "scripts/checkMarketBalanceHealth.ts";
const HEALTHCHECK_URL = process.env.HEALTHCHECK_URL; // dead-man's-switch ping URL (e.g. healthchecks.io)

function log(msg) {
  console.log(`[balance-monitor] ${msg}`);
}

// Lines from the health script start with the status icon. Keep only the ones
// that need attention; ✅ lines are healthy and ignored.
function atRiskLines(stdout) {
  return stdout
    .split("\n")
    .filter((line) => {
      const t = line.trimStart();
      return t.startsWith("❌") || t.startsWith("⚠️");
    });
}

function runHealthCheck(network) {
  const res = spawnSync("npx", ["--no-install", "hardhat", "run", "--network", network, MONITOR_SCRIPT], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    timeout: RUN_TIMEOUT_MS,
  });

  // Return stdout even on failure: the health script prints per market as it runs, so
  // lines flagged before an error/timeout can still be salvaged by the caller.
  const stdout = res.stdout || "";
  const combined = `${stdout}${res.stderr || ""}`;
  if (res.error) {
    // Strip Markdown specials: reason is interpolated into the alert header outside the code
    // block, so an unbalanced * _ [ ] ` from a spawn error would otherwise 400 the message.
    const reason = (
      res.error.code === "ETIMEDOUT" ? `timed out after ${RUN_TIMEOUT_MS / 1000}s` : String(res.error.message || res.error)
    ).replace(/[*_\[\]\x60]/g, "");
    return { ok: false, reason, stdout, output: combined };
  }
  if (res.status !== 0) {
    return { ok: false, exitCode: res.status, stdout, output: combined };
  }
  return { ok: true, stdout, output: stdout };
}

async function sendTelegram(text) {
  const res = await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, parse_mode: "Markdown", text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram sendMessage failed (${res.status}): ${body}`);
  }
}

// Wrap text in a Markdown code block. Strip backticks and bound the length so the closing
// fence can't break — a broken fence makes Telegram reject the whole message (400), which
// would silently drop the alert. Bounding here keeps each message under the 4096 limit.
function codeBlock(body) {
  let b = body.replace(/`/g, "'");
  if (b.length > CODE_BLOCK_MAX) b = b.slice(0, CODE_BLOCK_MAX) + "\n… (truncated)";
  return "```\n" + b + "\n```";
}

// Ping an external dead-man's-switch (e.g. healthchecks.io). If pings stop arriving, the
// service fires its own alert.
async function pingHealthcheck() {
  try {
    await fetch(HEALTHCHECK_URL);
  } catch (e) {
    log(`healthcheck ping failed: ${e && e.message ? e.message : e}`);
  }
}

async function main() {
  if (!BOT_TOKEN || !CHAT_ID || !HEALTHCHECK_URL) {
    log("missing TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID / HEALTHCHECK_URL — set them in .env");
    // No ping: a broken .env means the monitor isn't running.
    // Tells healthchecks the monitor is not working.
    process.exit(1);
  }

  log(`checking networks: ${NETWORKS.join(", ")}`);
  const alerts = [];

  for (const network of NETWORKS) {
    log(`running ${MONITOR_SCRIPT} on ${network}`);
    const result = runHealthCheck(network);

    // Scan stdout for flagged lines even when the run failed — lines printed before an
    // error/timeout are real and must not be dropped.
    const flagged = atRiskLines(result.stdout);
    if (flagged.length > 0) {
      log(`${network}: ${flagged.length} market(s) flagged`);
      alerts.push(`⚠️ GMX *${network}* markets need attention:\n${codeBlock(flagged.join("\n"))}`);
    }

    if (!result.ok) {
      const detail = result.exitCode ? ` (exit ${result.exitCode})` : result.reason ? ` (${result.reason})` : "";
      log(`run incomplete on ${network}${detail}${flagged.length ? ` — salvaged ${flagged.length} flagged line(s)` : ""}`);
      const tail = result.output.slice(-1500);
      alerts.push(`❌ GMX balance-monitor *incomplete* on *${network}*${detail} — scan may have missed markets:\n${codeBlock(tail)}`);
    } else if (flagged.length === 0) {
      log(`${network}: all healthy`);
    }
  }

  if (alerts.length === 0) {
    log("done — nothing to report");
    // Ping: clean run, all markets healthy.
    // Tells healthchecks the monitor is alive.
    await pingHealthcheck();
    process.exit(0);
  }

  let sent = 0;
  const sendFailures = [];
  for (const alert of alerts) {
    try {
      await sendTelegram(alert);
      sent++;
    } catch (e) {
      // One failed send must not suppress the remaining networks' alerts.
      sendFailures.push(String(e && e.message ? e.message : e));
      log(`send failed: ${e && e.message ? e.message : e}`);
    }
  }
  log(`done — sent ${sent}/${alerts.length} alert(s)${sendFailures.length ? `, ${sendFailures.length} failed` : ""}`);
  // Ping: runner reached the end (with or without flagged markets / send failures).
  // Tells healthchecks the monitor is alive.
  await pingHealthcheck();
  process.exit(sendFailures.length ? 1 : 0);
}

if (require.main === module) {
  main().catch((err) => {
    log(`unexpected error: ${err && err.stack ? err.stack : err}`);
    // Try to surface the failure to Telegram, then exit non-zero. No ping here on purpose:
    // if a crash also broke the Telegram send, the missing healthchecks ping is the only
    // alert left.
    if (BOT_TOKEN && CHAT_ID) {
      sendTelegram(`❌ GMX balance-monitor crashed:\n${codeBlock(String(err && err.message ? err.message : err))}`)
        .catch(() => {})
        .finally(() => process.exit(1));
    } else {
      process.exit(1);
    }
  });
}

module.exports = { atRiskLines, codeBlock };
