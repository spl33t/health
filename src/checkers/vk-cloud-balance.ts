import { randomUUID } from 'crypto';
import { chromium } from 'playwright';
import { IChecker, ICheckResult } from '../types';

/**
 * Чекер для проверки баланса VK Cloud.
 * Использует Playwright для имитации входа в личный кабинет и скрапинга баланса.
 */
export class VkCloudBalanceChecker implements IChecker {
    readonly id = randomUUID();
    readonly name = 'VK Cloud Balance';

    /**
     * @param email — email-логин от VK Cloud
     * @param pass — пароль от VK Cloud
     * @param threshold — минимальный баланс в рублях; алерт при достижении или падении ниже
     * @param intervalMs — интервал проверки в миллисекундах
     * @param headless — true — работа в фоне, false — показывать окно браузера (для отладки)
     */
    constructor(
        private email: string,
        private pass: string,
        public threshold: number,
        public intervalMs: number,
        private headless: boolean = true
    ) {}

    async check(): Promise<ICheckResult> {
        const timestamp = new Date();
        const target = 'https://cloud.vk.com';
        const browser = await chromium.launch({ headless: this.headless });
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            await page.goto('https://cloud.vk.com/authapp/signin', { waitUntil: 'networkidle' });

            await page.waitForSelector('input[name="email"]');
            await page.fill('input[name="email"]', this.email);
            await page.fill('input[name="password"]', this.pass);
            await page.click('button[data-test="button-signin"]');

            await page.waitForSelector('[data-test="balance-amount"]', { timeout: 120000 });
            const balanceText = await page.textContent('[data-test="balance-amount"]');

            if (!balanceText) throw new Error('Не удалось найти текст баланса на странице');

            const cleanText = balanceText.replace(/\u00a0/g, ' ').replace(/[^\d.,]/g, '').replace(',', '.');
            const balanceValue = parseFloat(cleanText);
            const isOk = balanceValue > this.threshold;

            if (!this.headless) {
                await page.waitForTimeout(5000);
            }

            await browser.close();

            return {
                checkerName: this.name,
                target,
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
                checkerName: this.name,
                target,
                isUp: false,
                message: `Ошибка скрапинга баланса VK Cloud: ${error.message}`,
                timestamp,
            };
        }
    }
}
