// PM2 config for the market balance monitor.
//
// Runs scripts/monitor/balanceMonitor.js once per cron tick, then exits.
// autorestart:false keeps it from looping; cron_restart re-launches it on schedule.
//
// Secrets are NOT stored here — the runner reads TELEGRAM_BOT_TOKEN and
// TELEGRAM_CHAT_ID from .env (gitignored). RPC overrides go in .rpcs.json.
//
//   pm2 start ecosystem.config.js
//   pm2 logs gmx-balance-monitor
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
      // env: { MONITOR_NETWORKS: "arbitrum,avalanche,botanix,megaEth" },
    },
  ],
};
