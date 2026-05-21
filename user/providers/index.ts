import { EmailProvider } from '../../core/providers/email';
import { TelegramProvider } from '../../core/providers/telegram';
import { defineProvider } from '../../core/health';
import { config } from '../config';

export const telegramMain = defineProvider(
    {
        uniqueName: 'telegram.main',
        provider: config.telegramEnabled && config.telegramBotToken && config.telegramChatId
            ? new TelegramProvider(config.telegramBotToken, config.telegramChatId)
            : undefined,
        reason: 'telegram provider disabled or not configured',
    }
);

export const emailMain = defineProvider(
    {
        uniqueName: 'email.main',
        provider: config.emailEnabled
            && config.smtpHost
            && config.smtpUser
            && config.smtpPass
            && config.emailFrom
            && config.emailToList.length > 0
            ? new EmailProvider({
                host: config.smtpHost,
                port: config.smtpPort,
                user: config.smtpUser,
                pass: config.smtpPass,
                from: config.emailFrom,
                to: config.emailToList,
            })
            : undefined,
        reason: 'email provider disabled or not configured',
    }
);
