// PM2 config for the GMX monitors.
//
// Each app runs its runner once per cron tick, then exits.
// autorestart:false keeps it from looping; cron_restart re-launches it on schedule.
//
// Secrets are NOT stored here — the runners read TELEGRAM_BOT_TOKEN and
// TELEGRAM_CHAT_ID from .env (gitignored). RPC overrides go in .rpcs.json.
// Each monitor pings its own healthchecks.io URL (BALANCE_HEALTHCHECK_URL,
// CONFIG_HEALTHCHECK_URL) so they have independent dead-man's-switches.
//
//   pm2 start ecosystem.config.js
//   pm2 logs gmx-balance-monitor
//   pm2 logs gmx-config-monitor
//   pm2 save        # persist across reboots (with `pm2 startup`)

module.exports = {
  apps: [
    {
      name: "gmx-balance-monitor",
      script: "scripts/monitor/balanceMonitor.js",
      cwd: __dirname,
      cron_restart: "0 8 * * *", // daily at 08:00; PM2 fires in the node's local time
      autorestart: false,
      instances: 1,
      time: true,
      // Optional override; defaults to arbitrum,avalanche,botanix,megaEth inside the runner.
      // env: { BALANCE_MONITOR_NETWORKS: "arbitrum,avalanche,botanix,megaEth" },
    },
    {
      // market config monitor: alerts when a team-owned config param's on-chain value
      // differs from the committed config on the updates branch.
      name: "gmx-config-monitor",
      script: "scripts/monitor/configMonitor.js",
      cwd: __dirname,
      cron_restart: "0 * * * *", // hourly, on the hour
      autorestart: false,
      instances: 1,
      time: true,
      // Optional override; defaults to arbitrum,avalanche,botanix,megaEth inside the runner.
      // env: { CONFIG_MONITOR_NETWORKS: "arbitrum,avalanche,botanix,megaEth" },
    },
  ],
};
