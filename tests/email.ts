import dotenv from 'dotenv';
import { EmailProvider } from '../core/providers/email';
import { ICheckResult } from '../core/types';

dotenv.config();

async function testEmail() {
    console.log('--- Запуск теста Email уведомлений ---');

    const smtpHost = process.env.SMTP_HOST || '';
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const smtpUser = process.env.SMTP_USER || '';
    const smtpPass = process.env.SMTP_PASS || '';
    const emailFrom = process.env.EMAIL_FROM || '';
    const emailToRaw = process.env.EMAIL_TO || '';
    const emailToList = emailToRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    if (!smtpHost || !smtpUser || !smtpPass || !emailFrom || emailToList.length === 0) {
        console.error('Ошибка: Не настроены SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM или EMAIL_TO в .env');
        return;
    }

    const provider = new EmailProvider({
        host: smtpHost,
        port: smtpPort,
        user: smtpUser,
        pass: smtpPass,
        from: emailFrom,
        to: emailToList,
    });

    const mockupResult: ICheckResult = {
        checkerName: 'Тестовый чекер',
        target: 'ТЕСТОВАЯ ПРОВЕРКА',
        isUp: false,
        status: 500,
        message: 'Это тестовое сообщение для проверки Email провайдера.',
        timestamp: new Date(),
    };

    console.log(`Отправка тестового алерта на ${emailToList.join(', ')}...`);

    try {
        await provider.sendAlert(mockupResult);
        console.log('✅ Запрос отправлен. Проверьте почту на наличие сообщения!');
    } catch (err: any) {
        console.error('❌ Ошибка при отправке:', err.message);
    }
}

testEmail().catch((err) => {
    console.error('Критическая ошибка:', err);
});
