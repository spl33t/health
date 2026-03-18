import dotenv from 'dotenv';
import { VkCloudBalanceChecker } from '../src/checkers/vk-cloud-balance';

dotenv.config();

async function testVkChecker() {
    console.log('--- Запуск теста VK Cloud Balance Checker ---');

    const email = process.env.VK_CLOUD_EMAIL || '';
    const pass = process.env.VK_CLOUD_PASS || '';

    if (!email || !pass) {
        console.error('Ошибка: Не настроены VK_CLOUD_EMAIL или VK_CLOUD_PASS в .env');
        return;
    }

    // Создаем чекер с headless: false, чтобы видеть окно браузера
    const checker = new VkCloudBalanceChecker(
        'Тест Баланса',
        email,
        pass,
        6000,
        0,
        false // headless = false (отключено, будет видно окно)
    );

    console.log('Запуск проверки (это может занять до 2-х минут)...');
    const result = await checker.check();

    console.log('\n--- Результат проверки ---');
    console.log(`Цель: ${result.target}`);
    console.log(`Статус: ${result.isUp ? '✅ OK' : '❌ ОШИБКА'}`);
    console.log(`Сообщение: ${result.message}`);
    console.log(`Время: ${result.timestamp.toLocaleString()}`);
}

testVkChecker().catch(err => {
    console.error('Критическая ошибка при тестировании:', err);
});
