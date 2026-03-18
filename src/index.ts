import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import * as os from 'os';
import { MonitorService } from './services/monitor';
import { TelegramProvider } from './providers/telegram';
import { EmailProvider } from './providers/email';
import { HttpChecker } from './checkers/http';
import { DiskChecker } from './checkers/disk';
import { RamChecker } from './checkers/ram';
import { CpuChecker } from './checkers/cpu';
import { VkCloudBalanceChecker } from './checkers/vk-cloud-balance';
import { DockerChecker } from './checkers/docker';
import { IChecker, IAlertProvider } from './types';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Конфигурация из окружения
const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
const chatId = process.env.TELEGRAM_CHAT_ID || '';
const targetsRaw = process.env.HTTP_CHECK_TARGETS || '[]';

const checkers: IChecker[] = [];

// Добавление HTTP чекеров из конфига (пустой массив — чекеры не добавляются)
try {
    const targets = JSON.parse(targetsRaw);
    if (Array.isArray(targets) && targets.length > 0) {
        targets.forEach((t: any) => {
            checkers.push(new HttpChecker(t.name, t.url, t.intervalMs));
        });
    }
} catch (e) {
    console.error('Ошибка парсинга HTTP_CHECK_TARGETS:', e);
}

// Добавление чекера диска (проверка всех дисков, порог 10%)
checkers.push(new DiskChecker('Дисковое пространство', 20, 60000));

// Добавление чекера RAM (порог 15%)
checkers.push(new RamChecker('Оперативная память', 15, 30000));

// Добавление чекера CPU (порог 80%)
checkers.push(new CpuChecker('Процессор', 80, 10000));

// Добавление чекера баланса VK Cloud (включить: VK_CLOUD_BALANCE_ENABLED=true)
const vkBalanceEnabled = process.env.VK_CLOUD_BALANCE_ENABLED === 'true' || process.env.VK_CLOUD_BALANCE_ENABLED === '1';
const vkEmail = process.env.VK_CLOUD_EMAIL || '';
const vkPass = process.env.VK_CLOUD_PASS || '';
if (vkBalanceEnabled && vkEmail && vkPass) {
    checkers.push(new VkCloudBalanceChecker('VK Cloud', vkEmail, vkPass, 500, 3600000)); // Проверка раз в час, порог 500 руб.
} else if (vkBalanceEnabled && (!vkEmail || !vkPass)) {
    console.warn('VK_CLOUD_BALANCE_ENABLED=true, но VK_CLOUD_EMAIL или VK_CLOUD_PASS не заданы — проверка баланса VK Cloud отключена');
}

// Docker чекер (включить: DOCKER_CHECK_ENABLED=true). Алерт только после N подтверждённых сбоев подряд.
const dockerEnabled = process.env.DOCKER_CHECK_ENABLED === 'true' || process.env.DOCKER_CHECK_ENABLED === '1';
const dockerTargetsRaw = process.env.DOCKER_TARGETS || '["*"]';
const dockerConfirmThreshold = parseInt(process.env.DOCKER_CONFIRM_THRESHOLD || '3', 10);
const dockerSocketPath = (process.env.DOCKER_SOCKET_PATH || '').trim() || undefined;
if (dockerEnabled) {
    try {
        const dockerTargets = JSON.parse(dockerTargetsRaw);
        const targets = Array.isArray(dockerTargets) ? dockerTargets : ['*'];
        checkers.push(
            new DockerChecker('Docker', dockerSocketPath, targets, dockerConfirmThreshold, 30000)
        );
    } catch (e) {
        console.error('Ошибка парсинга DOCKER_TARGETS:', e);
    }
}

// Инициализация провайдеров уведомлений (все по умолчанию отключены)
const alertProviders: IAlertProvider[] = [];

// Telegram провайдер (включить: TELEGRAM_ENABLED=true)
const telegramEnabled = process.env.TELEGRAM_ENABLED === 'true' || process.env.TELEGRAM_ENABLED === '1';
if (telegramEnabled && botToken && chatId) {
    alertProviders.push(new TelegramProvider(botToken, chatId));
} else if (telegramEnabled && (!botToken || !chatId)) {
    console.warn('TELEGRAM_ENABLED=true, но TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заданы — Telegram-уведомления отключены');
}

// Email провайдер (включить: EMAIL_ENABLED=true)
const emailEnabled = process.env.EMAIL_ENABLED === 'true' || process.env.EMAIL_ENABLED === '1';
const smtpHost = process.env.SMTP_HOST || '';
const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
const smtpUser = process.env.SMTP_USER || '';
const smtpPass = process.env.SMTP_PASS || '';
const emailFrom = process.env.EMAIL_FROM || '';
const emailTo = process.env.EMAIL_TO || '';
if (emailEnabled && smtpHost && smtpUser && smtpPass && emailFrom && emailTo) {
    alertProviders.push(new EmailProvider({ host: smtpHost, port: smtpPort, user: smtpUser, pass: smtpPass, from: emailFrom, to: emailTo }));
} else if (emailEnabled && (!smtpHost || !smtpUser || !smtpPass || !emailFrom || !emailTo)) {
    console.warn('EMAIL_ENABLED=true, но SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM или EMAIL_TO не заданы — email-уведомления отключены');
}

// Инициализация и запуск службы мониторинга
const monitorService = new MonitorService(checkers, alertProviders);
monitorService.start();

// Рассылка системных уведомлений (старт/стоп) по провайдерам
async function notifyProviders(result: { target: string; isUp: boolean; message: string }) {
    if (alertProviders.length === 0) return;
    const payload = { ...result, timestamp: new Date() };
    await Promise.allSettled(alertProviders.map((p) => p.sendAlert(payload)));
}

// Маршруты
app.get('/status', (req: Request, res: Response) => {
    res.json({
        status: 'ok',
        monitoring: monitorService.getStatus(),
    });
});

// Mock target для тестов
app.get('/mock-target', (req: Request, res: Response) => {
    res.status(200).send('Mock Service UP');
});

app.listen(port, async () => {
    console.log(`Сервер Health Monitor запущен на http://localhost:${port}`);
    console.log('Активные проверки:', checkers.map(c => c.name).join(', '));
    await notifyProviders({
        target: 'Health Monitor',
        isUp: true,
        message: 'Health Monitor запущен и работает',
    });
});

// Уведомление при завершении процесса
let isShuttingDown = false;
async function shutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`Получен ${signal}, завершение...`);
    try {
        await Promise.race([
            notifyProviders({
                target: 'Health Monitor',
                isUp: false,
                message: 'Health Monitor остановлен',
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
        ]);
    } catch (e) {
        // игнорируем таймаут или ошибки отправки
    } finally {
        process.exit(0);
    }
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
