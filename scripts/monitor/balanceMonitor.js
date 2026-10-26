// Runs checkMarketBalanceHealth.ts on each network and posts a Telegram alert
// when any market is flagged (❌ broken / ⚠️ claims will revert) or when a run fails.
// Meant to be run once per cron tick by PM2 (see ecosystem.config.js).

require("dotenv").config();

const { DEFAULT_NETWORKS, makeLog, runHardhatScript, codeBlock, sendTelegram, pingHealthcheck } = require("./utils");

const log = makeLog("balance-monitor");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const NETWORKS = (process.env.BALANCE_MONITOR_NETWORKS || DEFAULT_NETWORKS)
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);
const MONITOR_SCRIPT = process.env.BALANCE_MONITOR_SCRIPT || "scripts/checkMarketBalanceHealth.ts";
const HEALTHCHECK_URL = process.env.BALANCE_HEALTHCHECK_URL; // dead-man's-switch ping URL (e.g. healthchecks.io)

// Lines from the health script start with the status icon. Keep only the ones
// that need attention; ✅ lines are healthy and ignored.
function atRiskLines(stdout) {
  return stdout.split("\n").filter((line) => {
    const t = line.trimStart();
    return t.startsWith("❌") || t.startsWith("⚠️");
  });
}

async function main() {
  if (!BOT_TOKEN || !CHAT_ID || !HEALTHCHECK_URL) {
    log("missing TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID / BALANCE_HEALTHCHECK_URL — set them in .env");
    // No ping: a broken .env means the monitor isn't running.
    // Tells healthchecks the monitor is not working.
    process.exit(1);
  }

  log(`checking networks: ${NETWORKS.join(", ")}`);
  const alerts = [];

  for (const network of NETWORKS) {
    log(`running ${MONITOR_SCRIPT} on ${network}`);
    const result = runHardhatScript(network, MONITOR_SCRIPT);

    // Scan stdout for flagged lines even when the run failed — lines printed before an
    // error/timeout are real and must not be dropped.
    const flagged = atRiskLines(result.stdout);
    if (flagged.length > 0) {
      log(`${network}: ${flagged.length} market(s) flagged`);
      alerts.push(`⚠️ GMX *${network}* markets need attention:\n${codeBlock(flagged.join("\n"))}`);
    }

    if (!result.ok) {
      const detail = result.exitCode ? ` (exit ${result.exitCode})` : result.reason ? ` (${result.reason})` : "";
      log(
        `run incomplete on ${network}${detail}${flagged.length ? ` — salvaged ${flagged.length} flagged line(s)` : ""}`
      );
      const tail = result.output.slice(-1500);
      alerts.push(
        `❌ GMX balance-monitor *incomplete* on *${network}*${detail} — scan may have missed markets:\n${codeBlock(
          tail
        )}`
      );
    } else if (flagged.length === 0) {
      log(`${network}: all healthy`);
    }
  }

  if (alerts.length === 0) {
    log("done — nothing to report");
    // Ping: clean run, all markets healthy.
    // Tells healthchecks the monitor is alive.
    await pingHealthcheck(HEALTHCHECK_URL, log);
    process.exit(0);
  }

  let sent = 0;
  const sendFailures = [];
  for (const alert of alerts) {
    try {
      await sendTelegram(BOT_TOKEN, CHAT_ID, alert);
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
  await pingHealthcheck(HEALTHCHECK_URL, log);
  process.exit(sendFailures.length ? 1 : 0);
}

if (require.main === module) {
  main().catch((err) => {
    log(`unexpected error: ${err && err.stack ? err.stack : err}`);
    // Try to surface the failure to Telegram, then exit non-zero. No ping here on purpose:
    // if a crash also broke the Telegram send, the missing healthchecks ping is the only
    // alert left.
    if (BOT_TOKEN && CHAT_ID) {
      sendTelegram(
        BOT_TOKEN,
        CHAT_ID,
        `❌ GMX balance-monitor crashed:\n${codeBlock(String(err && err.message ? err.message : err))}`
      )
        .catch(() => {})
        .finally(() => process.exit(1));
    } else {
      process.exit(1);
    }
  });
}

module.exports = { atRiskLines, codeBlock };
