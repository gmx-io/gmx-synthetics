#!/bin/bash

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
RUN_SH="$REPO_DIR/scripts/switchover/run.sh"
RUN_NYSE_SH="$REPO_DIR/scripts/switchover/run_nyse.sh"

# Weekly: closed Fri 20:45 UTC, open Sun 22:15 UTC
# Daily Mon-Thu: closed 20:45 UTC, open 22:15 UTC
CRON_ENTRIES="
45 20 * * 1-5  SWITCHOVER_TG_MESSAGES=true $RUN_SH $REPO_DIR/scripts/switchover/arbitrumSepolia/XAU_closed.sh
15 22 * * 0,1-4  SWITCHOVER_TG_MESSAGES=true $RUN_SH $REPO_DIR/scripts/switchover/arbitrumSepolia/XAU_open.sh
45 20 * * 1-5  SWITCHOVER_TG_MESSAGES=true $RUN_SH $REPO_DIR/scripts/switchover/arbitrum/GOLD_closed.sh
15 22 * * 0,1-4  SWITCHOVER_TG_MESSAGES=true $RUN_SH $REPO_DIR/scripts/switchover/arbitrum/GOLD_open.sh
45 20 * * 1-5  SWITCHOVER_TG_MESSAGES=true $RUN_SH $REPO_DIR/scripts/switchover/arbitrum/SILVER_closed.sh
15 22 * * 0,1-4  SWITCHOVER_TG_MESSAGES=true $RUN_SH $REPO_DIR/scripts/switchover/arbitrum/SILVER_open.sh
45 20 * * 1-5  SWITCHOVER_TG_MESSAGES=true $RUN_SH $REPO_DIR/scripts/switchover/arbitrum/WTIOIL_closed.sh
15 22 * * 0,1-4  SWITCHOVER_TG_MESSAGES=true $RUN_SH $REPO_DIR/scripts/switchover/arbitrum/WTIOIL_open.sh
45 20 * * 1-5  SWITCHOVER_TG_MESSAGES=true $RUN_SH $REPO_DIR/scripts/switchover/arbitrum/BRENTOIL_closed.sh
15 22 * * 0,1-4  SWITCHOVER_TG_MESSAGES=true $RUN_SH $REPO_DIR/scripts/switchover/arbitrum/BRENTOIL_open.sh
45 20 * * 1-5  SWITCHOVER_TG_MESSAGES=true $RUN_SH $REPO_DIR/scripts/switchover/arbitrum/NATGAS_closed.sh
15 22 * * 0,1-4  SWITCHOVER_TG_MESSAGES=true $RUN_SH $REPO_DIR/scripts/switchover/arbitrum/NATGAS_open.sh
# SPCX (NYSE hours, Mon-Fri): on-hours 09:45, off-hours 15:45 America/New_York (15-min grace inside session)
# fixed UTC times, valid while US is on EDT; shift by +1h on Nov 1, 2026 (EST): open 14:45, closed 20:45 UTC
# run_nyse.sh skips NYSE full-day closures from nyse_holidays.txt (off-hours params stay active all day)
45 13 * * 1-5  SWITCHOVER_TG_MESSAGES=true $RUN_NYSE_SH $REPO_DIR/scripts/switchover/arbitrum/SPCX_open.sh
45 19 * * 1-5  SWITCHOVER_TG_MESSAGES=true $RUN_NYSE_SH $REPO_DIR/scripts/switchover/arbitrum/SPCX_closed.sh
"

# remove old switchover entries, append new ones
(crontab -l 2>/dev/null | grep -v "$REPO_DIR/scripts/switchover/" || true; echo "$CRON_ENTRIES") | crontab -

echo "Cron entries installed:"
crontab -l | grep "$REPO_DIR/scripts/switchover/"
