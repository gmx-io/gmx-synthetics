# Market hours switchover

Cron-driven switching of market params between on-hours and off-hours states
(commodities, SPCX/NYSE).

IMPORTANT: Valid until **November 1, 2026** (end of US DST): cron runs at fixed UTC
times, correct only while the US is on EDT. Before that date shift the times
or retire this setup in favor of the risk oracle app.

## How it works

- `setup_cron.sh` installs the crontab entries (idempotent); `uninstall_cron.sh` removes them.
- `*_open.sh` / `*_closed.sh` apply `MARKET_STATE=onHours|offHours` via
  `updateMarketConfig.ts` (off-hours = main config block merged with the
  market's `closedState` overrides in `config/markets.ts`).
- `run.sh` runs the script, logs to `logs/switchover/<chain>/` and reports to
  telegram: ✅ with tx hash, ❌ with the log tail. A run without a transaction
  counts as failed, so `closedState` must always differ from on-hours in at
  least one key.
- SPCX goes through `run_nyse.sh`: on NYSE full-day closures from
  `nyse_holidays.txt` both switchovers are skipped (reported to telegram),
  the market stays on off-hours params all day.

## Schedule (UTC, while US is on EDT)

- Commodities: open Sun–Thu 22:15, close Mon–Fri 20:45.
- SPCX: open Mon–Fri 13:45, close Mon–Fri 19:45 (09:45/15:45 NY, 15-min grace
  inside the session). No NYSE early-close days before Nov 1, 2026, so
  half-days are not handled.

No weekly maintenance is needed — Keeper does monitoring

## If a switchover fails

```bash
scripts/switchover/run.sh scripts/switchover/arbitrum/SPCX_closed.sh
```

or

```bash
# enable
MARKET=0x470128853D74dab7423904a20eA5AA230e9e561B \
MARKET_STATE=onHours \
npx hardhat run scripts/updateMarketConfig.ts --network arbitrum

# disable
MARKET=0x470128853D74dab7423904a20eA5AA230e9e561B \
MARKET_STATE=offHours \
npx hardhat run scripts/updateMarketConfig.ts --network arbitrum
```

A "no changes to apply" error means the market is already in the target state.
