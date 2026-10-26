#!/bin/bash

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
RUNNER="$REPO_DIR/scripts/switchover/runScheduled.js"
LOCK_FILE="$REPO_DIR/scripts/switchover/state/.cron.lock"
LOG_FILE="$REPO_DIR/logs/switchover/cron.log"

# Optional: path to the generated schedule, when it is kept outside the working tree
# (recommended — a git checkout would wipe it). Defaults to scripts/switchover/schedule.txt.
SCHEDULE_ARG=""
if [ $# -ge 1 ]; then
  SCHEDULE_ARG=" --schedule '$1'"
fi

# cron runs with a bare PATH (/usr/bin:/bin), and on this host node comes from nvm, so
# both the runner and the `npx` it spawns need the directory baked into the entry.
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: node not found on PATH — run this from a shell where \`node\` works (nvm use)" >&2
  exit 1
fi
NODE_DIR="$(cd "$(dirname "$NODE_BIN")" && pwd)"

if ! command -v flock > /dev/null; then
  echo "ERROR: flock not found (util-linux) — it serialises the per-minute ticks" >&2
  exit 1
fi

mkdir -p "$(dirname "$LOCK_FILE")" "$(dirname "$LOG_FILE")"

# One entry for everything. Switch instants come from the schedule file, so DST, exchange
# holidays and early closes are data rather than crontab arithmetic. The runner is
# level-triggered and exits in milliseconds when there is nothing to do, so a per-minute
# tick is cheap and bounds how late a switch can be.
#
# `flock -n` keeps ticks from overlapping while a switch is running; the kernel drops the
# lock on any exit, including a kill, so it can never wedge.
CRON_ENTRIES="* * * * *  cd $REPO_DIR && PATH=$NODE_DIR:\$PATH SWITCHOVER_TG_MESSAGES=true flock -n $LOCK_FILE node $RUNNER$SCHEDULE_ARG >> $LOG_FILE 2>&1"

# remove old switchover entries, append new ones
(crontab -l 2>/dev/null | grep -vF "$REPO_DIR/scripts/switchover/" || true; echo "$CRON_ENTRIES") | crontab -

echo "Cron entry installed:"
crontab -l | grep -F "$REPO_DIR/scripts/switchover/"
