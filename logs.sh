#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${SCRIPT_DIR}/logs"
UNIT_NAME="${UNIT_NAME:-health-monitor.service}"

if [[ -d "$LOG_DIR" && ( -f "$LOG_DIR/app.log" || -f "$LOG_DIR/app.err.log" ) ]]; then
    tail -n 200 -F "$LOG_DIR/app.log" "$LOG_DIR/app.err.log"
    exit 0
fi

if command -v journalctl >/dev/null 2>&1; then
    if [[ "$(id -u)" -eq 0 ]]; then
        journalctl -u "$UNIT_NAME" -n 200 -f
    elif command -v sudo >/dev/null 2>&1; then
        sudo journalctl -u "$UNIT_NAME" -n 200 -f
    else
        journalctl -u "$UNIT_NAME" -n 200 -f
    fi
    exit 0
fi

echo "No logs available (no logs/ files and no journalctl)."
exit 1

