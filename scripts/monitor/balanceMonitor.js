// Runs checkMarketBalanceHealth.ts on each network and posts a Telegram alert
// when any market is flagged (❌ broken / ⚠️ claims will revert) or when a run fails.
// Meant to be run once per cron tick by PM2 (see ecosystem.config.js).

require("dotenv").config();

const { spawnSync } = require("child_process");

const TELEGRAM_API = "https://api.telegram.org";
const TELEGRAM_MAX_LEN = 4096;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const NETWORKS = (process.env.MONITOR_NETWORKS || "arbitrum,avalanche,botanix,megaEth")
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);
const MONITOR_SCRIPT = process.env.MONITOR_SCRIPT || "scripts/checkMarketBalanceHealth.ts";

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
  });

  if (res.error) {
    return { ok: false, output: String(res.error.message || res.error) };
  }
  const output = `${res.stdout || ""}${res.stderr || ""}`;
  if (res.status !== 0) {
    return { ok: false, exitCode: res.status, output };
  }
  return { ok: true, output: res.stdout || "" };
}

async function sendTelegram(text) {
  // Telegram drops the whole message (400) if it's over 4096 chars, so truncate —
  // otherwise an alert flagging many markets at once (very unlikely) would never arrive.
  const trimmed = text.length > TELEGRAM_MAX_LEN ? `${text.slice(0, TELEGRAM_MAX_LEN - 20)}\n… (truncated)` : text;
  const res = await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, parse_mode: "Markdown", text: trimmed }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram sendMessage failed (${res.status}): ${body}`);
  }
}

function codeBlock(body) {
  return "```\n" + body + "\n```";
}

async function main() {
  if (!BOT_TOKEN || !CHAT_ID) {
    log("missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID — set them in .env");
    process.exit(1);
  }

  log(`checking networks: ${NETWORKS.join(", ")}`);
  const alerts = [];

  for (const network of NETWORKS) {
    log(`running ${MONITOR_SCRIPT} on ${network}`);
    const result = runHealthCheck(network);

    if (!result.ok) {
      log(`run failed on ${network}`);
      const tail = result.output.slice(-1500);
      alerts.push(`❌ GMX balance-monitor *failed* on *${network}*${result.exitCode ? ` (exit ${result.exitCode})` : ""}:\n${codeBlock(tail)}`);
      continue;
    }

    const flagged = atRiskLines(result.output);
    if (flagged.length > 0) {
      log(`${network}: ${flagged.length} market(s) flagged`);
      alerts.push(`⚠️ GMX *${network}* markets need attention:\n${codeBlock(flagged.join("\n"))}`);
    } else {
      log(`${network}: all healthy`);
    }
  }

  if (alerts.length === 0) {
    log("done — nothing to report");
    process.exit(0);
  }

  for (const alert of alerts) {
    await sendTelegram(alert);
  }
  log(`done — sent ${alerts.length} alert(s)`);
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    log(`unexpected error: ${err && err.stack ? err.stack : err}`);
    // Try to surface the failure to Telegram, then exit non-zero.
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
