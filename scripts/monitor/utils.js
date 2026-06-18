// Shared plumbing for the GMX monitor runners in this folder (scripts/monitor/*Monitor.js).
//
// Each runner does the same thing: spawn a per-network hardhat script, scan its output for findings,
// and post them to Telegram while pinging a healthchecks.io dead-man's-switch. That spawn / Telegram
// / healthcheck plumbing is identical across runners and lives here, so a new monitor only has to add
// its own finding detector (which output lines count) and its own main() orchestration.

const { spawnSync } = require("child_process");

const TELEGRAM_API = "https://api.telegram.org";
const RUN_TIMEOUT_MS = 5 * 60 * 1000; // kill a hung hardhat run so a stuck RPC can't dark the tick until the next cron
const CODE_BLOCK_MAX = 3500; // keep each message under Telegram's 4096 limit, with room for the prefix + fences

// Default networks every monitor checks unless its own *_NETWORKS env var overrides. Defined once
// here so the list stays the same across runners; same comma-separated format as the env override.
const DEFAULT_NETWORKS = "arbitrum,avalanche,botanix,megaEth";

// Prefix each runner's console output with its name so interleaved PM2 logs stay attributable.
function makeLog(prefix) {
  return (msg) => console.log(`[${prefix}] ${msg}`);
}

// Run a hardhat script on one network, killing it after RUN_TIMEOUT_MS. Returns stdout even on
// failure: the scripts print findings as they run, so lines printed before an error/timeout can
// still be salvaged by the caller.
function runHardhatScript(network, script) {
  const res = spawnSync("npx", ["--no-install", "hardhat", "run", "--network", network, script], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    timeout: RUN_TIMEOUT_MS,
  });

  const stdout = res.stdout || "";
  const combined = `${stdout}${res.stderr || ""}`;
  if (res.error) {
    // Strip Markdown specials: reason is interpolated into the alert header outside the code
    // block, so an unbalanced * _ [ ] ` from a spawn error would otherwise 400 the message.
    const reason = (
      res.error.code === "ETIMEDOUT"
        ? `timed out after ${RUN_TIMEOUT_MS / 1000}s`
        : String(res.error.message || res.error)
    ).replace(/[*_\[\]\x60]/g, "");
    return { ok: false, reason, stdout, output: combined };
  }
  if (res.status !== 0) {
    return { ok: false, exitCode: res.status, stdout, output: combined };
  }
  return { ok: true, stdout, output: stdout };
}

// Wrap text in a Markdown code block. Strip backticks and bound the length so the closing fence
// can't break — a broken fence makes Telegram reject the whole message (400), which would silently
// drop the alert. Bounding here keeps each message under the 4096 limit.
function codeBlock(body) {
  let b = body.replace(/`/g, "'");
  if (b.length > CODE_BLOCK_MAX) b = b.slice(0, CODE_BLOCK_MAX) + "\n… (truncated)";
  return "```\n" + b + "\n```";
}

async function sendTelegram(botToken, chatId, text) {
  const res = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, parse_mode: "Markdown", text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram sendMessage failed (${res.status}): ${body}`);
  }
}

// Ping an external dead-man's-switch (e.g. healthchecks.io). If pings stop arriving, the service
// fires its own alert.
async function pingHealthcheck(url, log) {
  try {
    await fetch(url);
  } catch (e) {
    log(`healthcheck ping failed: ${e && e.message ? e.message : e}`);
  }
}

module.exports = {
  DEFAULT_NETWORKS,
  makeLog,
  runHardhatScript,
  codeBlock,
  sendTelegram,
  pingHealthcheck,
};
