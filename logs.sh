#!/usr/bin/env bash

set -euo pipefail

UNIT_NAME="${UNIT_NAME:-health-monitor.service}"

if ! command -v journalctl >/dev/null 2>&1; then
    echo "journalctl is not available on this system."
    exit 1
fi

if [[ "$(id -u)" -eq 0 ]]; then
    journalctl -u "$UNIT_NAME" -n 500 --no-pager
    exit 0
fi

if command -v sudo >/dev/null 2>&1; then
    sudo journalctl -u "$UNIT_NAME" -n 500 --no-pager
else
    journalctl -u "$UNIT_NAME" -n 500 --no-pager
fi
