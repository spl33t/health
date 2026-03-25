import dotenv from 'dotenv';
import { TelegramProvider } from '../src/providers/telegram';
import { ICheckResult } from '../src/types';

dotenv.config();

async function testTelegram() {
    console.log('--- Запуск теста Telegram уведомлений ---');

    const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    const chatId = process.env.TELEGRAM_CHAT_ID || '';

    if (!botToken || !chatId) {
        console.error('Ошибка: Не настроены TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID в .env');
        return;
    }

    const provider = new TelegramProvider(botToken, chatId);

    const mockupResult: ICheckResult = {
        checkerName: 'Тестовый чекер',
        target: 'ТЕСТОВАЯ ПРОВЕРКА',
        isUp: false,
        status: 500,
        message: 'Это тестовое сообщение для проверки связи с ботом.',
        timestamp: new Date(),
    };

    console.log(`Отправка тестового алерта в чат ${chatId}...`);

    try {
        await provider.sendAlert(mockupResult);
        console.log('✅ Запрос отправлен. Проверьте ваш Telegram на наличие сообщения!');
    } catch (err: any) {
        console.error('❌ Ошибка при отправке:', err.message);
    }
}

testTelegram().catch(err => {
    console.error('Критическая ошибка:', err);
});
