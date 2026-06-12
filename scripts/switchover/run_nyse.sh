#!/bin/bash

# Wrapper around run.sh for markets following NYSE hours.
# Skips NYSE full-day closures listed in nyse_holidays.txt: on those dates
# both switchovers are skipped, so off-hours params from the previous close
# stay active all day (no extra transactions).
#
# Usage: run_nyse.sh <script.sh>

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <script.sh>"
  exit 1
fi

SWITCHOVER_DIR="$(cd "$(dirname "$0")" && pwd)"
HOLIDAYS_FILE="$SWITCHOVER_DIR/nyse_holidays.txt"

NY_DATE="$(TZ=America/New_York date +%F)"
if grep -qx "$NY_DATE" "$HOLIDAYS_FILE" 2>/dev/null; then
  exit 0
fi

exec "$SWITCHOVER_DIR/run.sh" "$@"
