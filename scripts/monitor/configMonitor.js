// Runs scripts/compareMarketConfig.ts on each network and posts a Telegram alert when any market
// config param's live on-chain value differs from config/markets.ts on the current branch, or when
// a run fails. Meant to be run once per cron tick by PM2 (see ecosystem.config.js).
//
// Only the keys the team owns are compared; the keys written by the risk oracle and the funding
// keeper are excluded inside compareMarketConfig, because config/markets.ts is not their source of
// truth. So a reported difference is always a real, unreconciled change on a team-owned key.

require("dotenv").config();

const { spawnSync } = require("child_process");
const { DEFAULT_NETWORKS, makeLog, runHardhatScript, codeBlock, sendTelegram, pingHealthcheck } = require("./utils");

const log = makeLog("config-monitor");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const NETWORKS = (process.env.CONFIG_MONITOR_NETWORKS || DEFAULT_NETWORKS)
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);
const MONITOR_SCRIPT = process.env.CONFIG_MONITOR_SCRIPT || "scripts/compareMarketConfig.ts";
const HEALTHCHECK_URL = process.env.CONFIG_HEALTHCHECK_URL; // dead-man's-switch ping URL (e.g. healthchecks.io)

// The comparison reads config/markets.ts from the working tree, so the baseline is whatever branch
// the monitor is run on — it must track `updates`. Resolve the branch so a monitor left on the wrong branch
// surfaces itself in the log and every alert, instead of silently comparing against the wrong config.
// Read-only; degrades to "unknown".
function gitBranch() {
  try {
    const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).stdout || "";
    return branch.trim() || "unknown";
  } catch (e) {
    return "unknown";
  }
}

// compareMarketConfig prints one "Difference: ..." line per param whose on-chain value differs from
// the branch config. Keep only those; everything else is progress noise.
function differenceLines(stdout) {
  return stdout.split("\n").filter((line) => line.trimStart().startsWith("Difference:"));
}

async function main() {
  if (!BOT_TOKEN || !CHAT_ID || !HEALTHCHECK_URL) {
    log("missing TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID / CONFIG_HEALTHCHECK_URL — set them in .env");
    // No ping: a broken .env means the monitor isn't running.
    // Tells healthchecks the monitor is not working.
    process.exit(1);
  }

  const branch = gitBranch();
  log(`checking networks: ${NETWORKS.join(", ")} — branch ${branch} (monitor must run on the updates branch)`);
  const alerts = [];

  for (const network of NETWORKS) {
    log(`running ${MONITOR_SCRIPT} on ${network}`);
    const result = runHardhatScript(network, MONITOR_SCRIPT);

    const differences = differenceLines(result.stdout);
    if (differences.length > 0) {
      log(`${network}: ${differences.length} param(s) differ`);
      alerts.push(
        `⚠️ GMX *${network}* market config — ${
          differences.length
        } param(s) differ from config (branch: ${branch}):\n${codeBlock(differences.join("\n"))}`
      );
    }

    // A non-zero exit with difference lines is the expected "differences found" signal, already
    // reported above. Treat it as an incomplete run only when no difference lines were printed —
    // that means the script threw or timed out and the comparison never completed.
    if (!result.ok && differences.length === 0) {
      const detail = result.exitCode ? ` (exit ${result.exitCode})` : result.reason ? ` (${result.reason})` : "";
      log(`run incomplete on ${network}${detail}`);
      const tail = result.output.slice(-1500);
      alerts.push(
        `❌ GMX config-monitor *incomplete* on *${network}*${detail} — comparison did not finish:\n${codeBlock(tail)}`
      );
    } else if (result.ok && differences.length === 0) {
      log(`${network}: in sync with updates`);
    }
  }

  if (alerts.length === 0) {
    log("done — nothing to report");
    // Ping: clean run, on-chain config in sync with the branch.
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
  // Ping: runner reached the end (with or without differences / send failures).
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
        `❌ GMX config-monitor crashed:\n${codeBlock(String(err && err.message ? err.message : err))}`
      )
        .catch(() => {})
        .finally(() => process.exit(1));
    } else {
      process.exit(1);
    }
  });
}

module.exports = { differenceLines, codeBlock };
