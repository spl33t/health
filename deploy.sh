#!/bin/bash

# Скрипт автоматического обновления и перезапуска Health Monitor
echo "--- Starting Deployment Updates ---"

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

# 5. Перезапуск приложения в PM2 (npx — без глобальной установки)
# Если процесс еще не запущен — он будет запущен. Если запущен — перезагружен.
echo "Restarting application in PM2..."
npx pm2 restart ecosystem.config.js || npx pm2 start ecosystem.config.js

# Сохраняем список процессов PM2 для автозагрузки
npx pm2 save

echo "--- Deployment Finished Successfully! ---"
echo "Tip: To enable startup on boot, run 'pm2 startup' once manually."
