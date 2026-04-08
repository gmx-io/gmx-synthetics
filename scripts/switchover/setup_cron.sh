#!/bin/bash

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
RUN_SH="$REPO_DIR/scripts/switchover/run.sh"

# CRON_ENTRIES="
# 0 * * * *  $RUN_SH $REPO_DIR/scripts/switchover/arbitrumSepolia/XAU_open.sh
# 30 * * * *  $RUN_SH $REPO_DIR/scripts/switchover/arbitrumSepolia/XAU_closed.sh
# "
# XAU (arbitrumSepolia): open every 10 min at :00, closed every 10 min at :05
CRON_ENTRIES="
0,10,20,30,40,50 * * * *  $RUN_SH $REPO_DIR/scripts/switchover/arbitrumSepolia/XAU_open.sh
5,15,25,35,45,55 * * * *  $RUN_SH $REPO_DIR/scripts/switchover/arbitrumSepolia/XAU_closed.sh
"

# remove old switchover entries, append new ones
(crontab -l 2>/dev/null | grep -v "$REPO_DIR/scripts/switchover/" || true; echo "$CRON_ENTRIES") | crontab -

echo "Cron entries installed:"
crontab -l | grep "$REPO_DIR/scripts/switchover/"
