import { chromium } from 'playwright';
import { IChecker, ICheckResult } from '../types';

/**
 * Чекер для проверки баланса VK Cloud.
 * Использует Playwright для имитации входа в личный кабинет и скрапинга баланса.
 */
export class VkCloudBalanceChecker implements IChecker {
    /**
     * @param name — отображаемое имя для отчётов и алертов
     * @param email — email-логин от VK Cloud
     * @param pass — пароль от VK Cloud
     * @param threshold — минимальный баланс в рублях; алерт при достижении или падении ниже
     * @param intervalMs — интервал проверки в миллисекундах
     * @param headless — true — работа в фоне, false — показывать окно браузера (для отладки)
     */
    constructor(
        public name: string,
        private email: string,
        private pass: string,
        public threshold: number,
        public intervalMs: number,
        private headless: boolean = true
    ) { }

    async check(): Promise<ICheckResult> {
        const timestamp = new Date();
        const browser = await chromium.launch({ headless: this.headless });
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            // Переход на страницу входа
            await page.goto('https://cloud.vk.com/authapp/signin', { waitUntil: 'networkidle' });

            // Заполнение формы авторизации
            await page.waitForSelector('input[name="email"]');
            await page.fill('input[name="email"]', this.email);
            await page.fill('input[name="password"]', this.pass);
            await page.click('button[data-test="button-signin"]');

            // После клика мы НЕ ждем waitForNavigation (она может упасть по таймауту 30с), 
            // а сразу ждем появления селектора баланса с большим таймаутом.
            await page.waitForSelector('[data-test="balance-amount"]', { timeout: 120000 });
            const balanceText = await page.textContent('[data-test="balance-amount"]');

            if (!balanceText) throw new Error('Не удалось найти текст баланса на странице');

            // Очистка строки: удаляем неразрывные пробелы, символ рубля и преобразуем в число
            const cleanText = balanceText.replace(/\u00a0/g, ' ').replace(/[^\d.,]/g, '').replace(',', '.');
            const balanceValue = parseFloat(cleanText);
            const isOk = balanceValue > this.threshold;

            // В UI режиме добавим небольшую задержку перед закрытием, чтобы успеть увидеть результат
            if (!this.headless) {
                await page.waitForTimeout(5000);
            }

            await browser.close();

            return {
                target: `VK Cloud Balance (${this.name})`,
                isUp: isOk,
                message: isOk
                    ? `Баланс в норме: ${balanceValue} руб.`
                    : `НИЗКИЙ БАЛАНС VK CLOUD! Текущий: ${balanceValue} руб. Порог: ${this.threshold} руб.`,
                timestamp,
            };
        } catch (error: any) {
            if (!this.headless) {
                await page.waitForTimeout(5000);
            }
            await browser.close();
            return {
                target: `VK Cloud Balance (${this.name})`,
                isUp: false,
                message: `Ошибка скрапинга баланса VK Cloud: ${error.message}`,
                timestamp,
            };
        }
    }
}
