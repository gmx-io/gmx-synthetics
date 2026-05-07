#!/bin/bash

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

(crontab -l 2>/dev/null | grep -v "$REPO_DIR/scripts/switchover/" || true) | crontab -

echo "Switchover cron entries removed."
