#!/bin/bash

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$REPO_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env file not found at $ENV_FILE"
  exit 1
fi

source "$ENV_FILE"

set -a
source "$(dirname "$0")/switchover.env"
set +a

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
  echo "ERROR: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set in .env"
  exit 1
fi

if [ $# -lt 1 ]; then
  echo "Usage: $0 <script.sh>"
  exit 1
fi

SCRIPT="$1"
SCRIPT_NAME="$(basename "$SCRIPT" .sh)"
CHAIN_DIR="$(basename "$(dirname "$SCRIPT")")"
TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S)"

LOG_DIR="$REPO_DIR/logs/switchover"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/${CHAIN_DIR}.log"

send_telegram() {
  local message="$1"
  local disable_notification="$2"

  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d chat_id="$TELEGRAM_CHAT_ID" \
    -d text="$message" \
    -d parse_mode="HTML" \
    -d disable_notification="$disable_notification" \
    > /dev/null 2>&1
}

echo "" >> "$LOG_FILE"
echo "$(date) [$CHAIN_DIR/$SCRIPT_NAME] Starting" | tee -a "$LOG_FILE"

RUN_OUTPUT=$(mktemp)
bash "$SCRIPT" > "$RUN_OUTPUT" 2>&1 || true
cat "$RUN_OUTPUT" >> "$LOG_FILE"

TX_HASH="$(tail -20 "$RUN_OUTPUT" | awk '/tx sent:/ { sub(/.*tx sent: /, ""); print }' | tail -1)"
rm -f "$RUN_OUTPUT"

if [ -n "$TX_HASH" ]; then
  echo "$(date) [$CHAIN_DIR/$SCRIPT_NAME] Finished successfully" >> "$LOG_FILE"
  send_telegram "✅ <b>${SCRIPT_NAME}</b> (${CHAIN_DIR}) succeeded
tx: <code>${TX_HASH}</code>" "true"
else
  echo "$(date) [$CHAIN_DIR/$SCRIPT_NAME] Failed" >> "$LOG_FILE"
  TAIL="$(tail -10 "$LOG_FILE" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g')"
  send_telegram "❌ <b>${SCRIPT_NAME}</b> (${CHAIN_DIR}) failed
<pre>${TAIL}</pre>" "false"
fi

# trim log to last 10000 lines
MAX_LOG_LINES=10000
LOG_LINES=$(wc -l < "$LOG_FILE")
if [ "$LOG_LINES" -gt "$MAX_LOG_LINES" ]; then
  tail -n "$MAX_LOG_LINES" "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi
