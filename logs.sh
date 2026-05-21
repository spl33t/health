#!/bin/bash

set -euo pipefail

UNIT_NAME="${UNIT_NAME:-health-monitor.service}"

if ! command -v journalctl >/dev/null 2>&1; then
    echo "journalctl not found (this script expects systemd logs)."
    exit 1
fi

if [[ "${1:-}" == "--follow" ]]; then
    journalctl -u "${UNIT_NAME}" -n 200 -f
else
    journalctl -u "${UNIT_NAME}" -n 200 --no-pager
fi
