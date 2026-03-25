import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { MonitorService } from './services/monitor';
import { TelegramProvider } from './providers/telegram';
import { EmailProvider } from './providers/email';
import { HttpChecker } from './checkers/http';
import { DiskChecker } from './checkers/disk';
import { RamChecker } from './checkers/ram';
import { CpuChecker } from './checkers/cpu';
import { VkCloudBalanceChecker } from './checkers/vk-cloud-balance';
import { createDockerContainerCheckers } from './checkers/docker';
import { IChecker, IAlertProvider, ICheckResult } from './types';

async function bootstrap() {
    dotenv.config();

    const app = express();
    const port = process.env.PORT || 3000;

    const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    const chatId = process.env.TELEGRAM_CHAT_ID || '';
    const targetsRaw = process.env.HTTP_CHECK_TARGETS || '[]';

    const checkers: IChecker[] = [];

    try {
        const targets = JSON.parse(targetsRaw);
        if (Array.isArray(targets) && targets.length > 0) {
            targets.forEach((t: any) => {
                const url = typeof t?.url === 'string' ? t.url : '';
                if (!url) return;
                const intervalMs = typeof t.intervalMs === 'number' && t.intervalMs > 0 ? t.intervalMs : 60000;
                checkers.push(new HttpChecker(url, intervalMs));
            });
        }
    } catch (e) {
        console.error('Ошибка парсинга HTTP_CHECK_TARGETS:', e);
    }

    checkers.push(new DiskChecker(20, 60000));
    checkers.push(new RamChecker(15, 30000));
    checkers.push(new CpuChecker(80, 10000));

    const vkBalanceEnabled =
        process.env.VK_CLOUD_BALANCE_ENABLED === 'true' || process.env.VK_CLOUD_BALANCE_ENABLED === '1';
    const vkEmail = process.env.VK_CLOUD_EMAIL || '';
    const vkPass = process.env.VK_CLOUD_PASS || '';
    if (vkBalanceEnabled && vkEmail && vkPass) {
        checkers.push(new VkCloudBalanceChecker(vkEmail, vkPass, 500, 3600000));
    } else if (vkBalanceEnabled && (!vkEmail || !vkPass)) {
        console.warn(
            'VK_CLOUD_BALANCE_ENABLED=true, но VK_CLOUD_EMAIL или VK_CLOUD_PASS не заданы — проверка баланса VK Cloud отключена'
        );
    }

    const dockerEnabled =
        process.env.DOCKER_CHECK_ENABLED === 'true' || process.env.DOCKER_CHECK_ENABLED === '1';
    const dockerTargetsRaw = process.env.DOCKER_TARGETS || '["*"]';
    const dockerConfirmThreshold = parseInt(process.env.DOCKER_CONFIRM_THRESHOLD || '3', 10);
    const dockerSocketPath = (process.env.DOCKER_SOCKET_PATH || '').trim() || undefined;
    if (dockerEnabled) {
        try {
            const dockerTargets = JSON.parse(dockerTargetsRaw);
            const targets = Array.isArray(dockerTargets) ? dockerTargets : ['*'];
            const dockerCheckers = await createDockerContainerCheckers(
                dockerSocketPath,
                targets,
                dockerConfirmThreshold,
                30000
            );
            checkers.push(...dockerCheckers);
            if (dockerCheckers.length === 0) {
                console.warn('Docker: по DOCKER_TARGETS не найдено контейнеров (или список целей пуст)');
            } else {
                console.log(
                    `Docker: ${dockerCheckers.length} чекер(ов): ${dockerCheckers
                        .map((c) => `${c.name}[${c.id.slice(0, 8)}]`)
                        .join(', ')}`
                );
            }
        } catch (e) {
            console.error('Ошибка инициализации Docker-чекеров:', e);
        }
    }

    const alertProviders: IAlertProvider[] = [];

    const telegramEnabled =
        process.env.TELEGRAM_ENABLED === 'true' || process.env.TELEGRAM_ENABLED === '1';
    if (telegramEnabled && botToken && chatId) {
        alertProviders.push(new TelegramProvider(botToken, chatId));
    } else if (telegramEnabled && (!botToken || !chatId)) {
        console.warn(
            'TELEGRAM_ENABLED=true, но TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заданы — Telegram-уведомления отключены'
        );
    }

    const emailEnabled = process.env.EMAIL_ENABLED === 'true' || process.env.EMAIL_ENABLED === '1';
    const smtpHost = process.env.SMTP_HOST || '';
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const smtpUser = process.env.SMTP_USER || '';
    const smtpPass = process.env.SMTP_PASS || '';
    const emailFrom = process.env.EMAIL_FROM || '';
    const emailTo = process.env.EMAIL_TO || '';
    if (emailEnabled && smtpHost && smtpUser && smtpPass && emailFrom && emailTo) {
        alertProviders.push(
            new EmailProvider({ host: smtpHost, port: smtpPort, user: smtpUser, pass: smtpPass, from: emailFrom, to: emailTo })
        );
    } else if (emailEnabled && (!smtpHost || !smtpUser || !smtpPass || !emailFrom || !emailTo)) {
        console.warn(
            'EMAIL_ENABLED=true, но SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM или EMAIL_TO не заданы — email-уведомления отключены'
        );
    }

    const downReminderHours = parseFloat(process.env.ALERT_DOWN_REMINDER_HOURS || '0');
    const downReminderMs =
        Number.isFinite(downReminderHours) && downReminderHours > 0
            ? Math.round(downReminderHours * 3600000)
            : 0;
    if (downReminderMs > 0) {
        console.log(
            `Повтор алертов при DOWN: каждые ${downReminderHours} ч (ALERT_DOWN_REMINDER_HOURS)`
        );
    }

    const monitorService = new MonitorService(checkers, alertProviders, downReminderMs);

    async function notifyProviders(result: Pick<ICheckResult, 'checkerName' | 'target' | 'isUp' | 'message'>) {
        if (alertProviders.length === 0) return;
        const payload: ICheckResult = { ...result, timestamp: new Date() };
        await Promise.allSettled(alertProviders.map((p) => p.sendAlert(payload)));
    }

    app.get('/status', (req: Request, res: Response) => {
        res.json({
            status: 'ok',
            monitoring: monitorService.getStatus(),
        });
    });

    app.get('/mock-target', (req: Request, res: Response) => {
        res.status(200).send('Mock Service UP');
    });

    app.listen(port, async () => {
        console.log(`Сервер Health Monitor запущен на http://localhost:${port}`);
        console.log(
            'Активные проверки:',
            checkers.map((c) => `${c.name}[${c.id.slice(0, 8)}]`).join(', ')
        );
        await notifyProviders({
            checkerName: 'Система',
            target: 'Health Monitor',
            isUp: true,
            message: 'Health Monitor запущен и работает',
        });
        monitorService.start();
    });

    let isShuttingDown = false;
    async function shutdown(signal: string) {
        if (isShuttingDown) return;
        isShuttingDown = true;
        console.log(`Получен ${signal}, завершение...`);
        try {
            await Promise.race([
                notifyProviders({
                    checkerName: 'Система',
                    target: 'Health Monitor',
                    isUp: false,
                    message: 'Health Monitor остановлен',
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
            ]);
        } catch (e) {
            // ignore
        } finally {
            process.exit(0);
        }
    }
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
    console.error(err);
    process.exit(1);
});
