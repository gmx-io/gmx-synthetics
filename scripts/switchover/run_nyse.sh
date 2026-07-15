#!/bin/bash

# Wrapper around run.sh for markets following NYSE hours.
# On NYSE full-day closures listed in nyse_holidays.txt the underlying script
# is not executed (switchover scripts are not idempotent and fail when the
# market is already in the target state); instead the skip is logged and a
# telegram notification is sent. Off-hours params from the previous close
# stay active for the whole holiday.
#
# Usage: run_nyse.sh <script.sh>

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <script.sh>"
  exit 1
fi

SWITCHOVER_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SWITCHOVER_DIR/../.." && pwd)"
HOLIDAYS_FILE="$SWITCHOVER_DIR/nyse_holidays.txt"

NY_DATE="$(TZ=America/New_York date +%F)"
if ! grep -qx "$NY_DATE" "$HOLIDAYS_FILE" 2>/dev/null; then
  exec "$SWITCHOVER_DIR/run.sh" "$@"
fi

# holiday: skip the switchover, log and notify
SCRIPT_NAME="$(basename "$1" .sh)"
CHAIN_DIR="$(basename "$(dirname "$1")")"

LOG_DIR="$REPO_DIR/logs/switchover/$CHAIN_DIR"
mkdir -p "$LOG_DIR"
echo "$(date) [$CHAIN_DIR/$SCRIPT_NAME] Skipped: NYSE holiday $NY_DATE" >> "$LOG_DIR/${SCRIPT_NAME}.log"

if [ -f "$REPO_DIR/.env" ]; then
  source "$REPO_DIR/.env"
fi
set -a
source "$SWITCHOVER_DIR/switchover.env"
set +a

MESSAGE="⏭ <b>${SCRIPT_NAME}</b> (${CHAIN_DIR}) skipped: NYSE holiday ${NY_DATE}"

if [ "$SWITCHOVER_TG_MESSAGES" = "true" ] && [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d chat_id="$TELEGRAM_CHAT_ID" \
    -d text="$MESSAGE" \
    -d parse_mode="HTML" \
    -d disable_notification="true" \
    > /dev/null 2>&1
else
  echo "$MESSAGE" >&2
fi
