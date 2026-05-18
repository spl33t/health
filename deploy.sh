#!/bin/bash

# Скрипт автоматического обновления и перезапуска Health Monitor
echo "--- Starting Deployment Updates ---"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1. Получаем последние изменения из репозитория
# echo "Pulling latest changes from git..."
# git pull

# 2. Устанавливаем и обновляем зависимости
echo "Installing dependencies..."
npm install

# 3. Собираем проект (TypeScript -> JavaScript)
echo "Building the project..."
npm run build

# 4. Проверяем и устанавливаем зависимости Playwright (для VK Cloud чекера)
case "$OSTYPE" in
    linux-gnu*)
        echo "Ensuring Playwright dependencies are installed..."
        npx playwright install chromium --with-deps
    ;;
esac

if [[ "$OSTYPE" == linux-gnu* ]] && command -v systemctl >/dev/null 2>&1; then
    TARGET_USER="${SUDO_USER:-$USER}"
    NODE_BIN="$(command -v node || true)"
    if [[ -z "$NODE_BIN" ]]; then
        echo "ERROR: node not found in PATH."
        exit 1
    fi
    
    UNIT_NAME="health-monitor.service"
    UNIT_PATH="/etc/systemd/system/${UNIT_NAME}"
    UNIT_TMP="$(mktemp)"
    
    cat > "$UNIT_TMP" <<EOF
[Unit]
Description=health-monitor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${TARGET_USER}
WorkingDirectory=${SCRIPT_DIR}
ExecStart=${NODE_BIN} ${SCRIPT_DIR}/dist/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
    
    echo "Installing systemd service (${UNIT_NAME})..."
    if [[ "$(id -u)" -eq 0 ]]; then
        cp "$UNIT_TMP" "$UNIT_PATH"
        chmod 0644 "$UNIT_PATH"
        systemctl daemon-reload
        systemctl enable --now "$UNIT_NAME"
        systemctl restart "$UNIT_NAME"
        elif command -v sudo >/dev/null 2>&1; then
        sudo cp "$UNIT_TMP" "$UNIT_PATH"
        sudo chmod 0644 "$UNIT_PATH"
        sudo systemctl daemon-reload
        sudo systemctl enable --now "$UNIT_NAME"
        sudo systemctl restart "$UNIT_NAME"
    else
        echo "ERROR: sudo not found; can't install systemd service automatically."
        echo "Unit file generated at: $UNIT_TMP"
        echo "Copy it manually with root privileges:"
        echo "  cp \"$UNIT_TMP\" \"$UNIT_PATH\""
        echo "  chmod 0644 \"$UNIT_PATH\""
        echo "  systemctl daemon-reload"
        echo "  systemctl enable --now \"$UNIT_NAME\""
        echo "  systemctl restart \"$UNIT_NAME\""
        exit 1
    fi
    
    rm -f "$UNIT_TMP"
else
    if [[ "${USE_PM2:-0}" == "1" ]]; then
        if ! command -v pm2 >/dev/null 2>&1; then
            echo "Installing PM2 globally..."
            npm install -g pm2
        fi
        
        pm2 update
        
        echo "Restarting application in PM2..."
        pm2 restart ecosystem.config.js || pm2 start ecosystem.config.js
        pm2 save
    else
        echo "ERROR: systemd not available and USE_PM2 is not enabled."
        echo "Set USE_PM2=1 to use PM2 fallback, or run on Linux with systemd."
        exit 1
    fi
fi

echo "--- Deployment Finished Successfully! ---"
echo "Autostart: configured via systemd (or via PM2 if USE_PM2=1)."
