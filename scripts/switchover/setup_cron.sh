#!/bin/bash

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
RUN_SH="$REPO_DIR/scripts/switchover/run.sh"

# Weekly: closed Fri 20:45 UTC, open Sun 22:15 UTC
# Daily Mon-Thu: closed 20:45 UTC, open 22:15 UTC
CRON_ENTRIES="
45 20 * * 1-5  $RUN_SH $REPO_DIR/scripts/switchover/arbitrumSepolia/XAU_closed.sh
15 22 * * 0,1-4  $RUN_SH $REPO_DIR/scripts/switchover/arbitrumSepolia/XAU_open.sh
45 20 * * 1-5  $RUN_SH $REPO_DIR/scripts/switchover/arbitrum/GOLD_closed.sh
15 22 * * 0,1-4  $RUN_SH $REPO_DIR/scripts/switchover/arbitrum/GOLD_open.sh
45 20 * * 1-5  $RUN_SH $REPO_DIR/scripts/switchover/arbitrum/SILVER_closed.sh
15 22 * * 0,1-4  $RUN_SH $REPO_DIR/scripts/switchover/arbitrum/SILVER_open.sh
"

# remove old switchover entries, append new ones
(crontab -l 2>/dev/null | grep -v "$REPO_DIR/scripts/switchover/" || true; echo "$CRON_ENTRIES") | crontab -

echo "Cron entries installed:"
crontab -l | grep "$REPO_DIR/scripts/switchover/"
