import { BaseChecker } from '../checkers/base-checker';
import { BaseAlertProvider } from '../providers/base-provider';
import { ICheckResult } from '../types';

/**
 * Сервис мониторинга, отвечающий за периодическую проверку целей
 * и уведомление провайдеров алертов при изменении статуса.
 */
export class MonitorService {
    private checkers: BaseChecker[] = [];
    private alertProviders: BaseAlertProvider[] = [];
    private started = false;
    private intervalsByCheckerId: Map<string, NodeJS.Timeout> = new Map();
    public onCheckRun:
        | ((args: {
            checker: BaseChecker;
            result: ICheckResult;
            previousIsUp: boolean | undefined;
            statusChanged: boolean;
            shouldNotify: boolean;
        }) => Promise<void> | void)
        | undefined;

    /**
     * @param downReminderIntervalMs интервал повторной рассылки при устойчивом DOWN (0 — отключено)
     */
    constructor(
        private downReminderIntervalMs: number = 0
    ) {
    }

    public addChecker(checker: BaseChecker) {
        if (this.checkers.some((c) => c.id === checker.id)) return;
        this.checkers.push(checker);
        if (this.started) {
            checker.lastIsUp = true;
            this.runCheck(checker);
            const interval = setInterval(() => this.runCheck(checker), checker.intervalMs);
            this.intervalsByCheckerId.set(checker.id, interval);
        }
    }

    public getCheckers(): BaseChecker[] {
        return [...this.checkers];
    }

    public removeChecker(checkerOrId: BaseChecker | string): boolean {
        const id = typeof checkerOrId === 'string' ? checkerOrId : checkerOrId.id;
        const before = this.checkers.length;
        this.checkers = this.checkers.filter((c) => c.id !== id);
        const interval = this.intervalsByCheckerId.get(id);
        if (interval) {
            clearInterval(interval);
            this.intervalsByCheckerId.delete(id);
        }
        return this.checkers.length !== before;
    }

    public addProvider(provider: BaseAlertProvider) {
        if (this.alertProviders.includes(provider)) return;
        this.alertProviders.push(provider);
    }

    public removeProvider(provider: BaseAlertProvider): boolean {
        const before = this.alertProviders.length;
        this.alertProviders = this.alertProviders.filter((p) => p !== provider);
        return this.alertProviders.length !== before;
    }

    public getProviders(): BaseAlertProvider[] {
        return [...this.alertProviders];
    }

    private logLabel(checker: BaseChecker): string {
        return `${checker.name} [${checker.id.slice(0, 8)}]`;
    }

    /**
     * Запускает цикл мониторинга для всех настроенных чекеров.
     */
    public start() {
        if (this.started) return;
        this.started = true;
        console.log('Запуск службы мониторинга...');
        this.checkers.forEach((checker) => {
            checker.lastIsUp = true;
            this.runCheck(checker);
            const interval = setInterval(() => this.runCheck(checker), checker.intervalMs);
            this.intervalsByCheckerId.set(checker.id, interval);
        });
    }

    public stop() {
        if (!this.started) return;
        this.started = false;
        for (const interval of this.intervalsByCheckerId.values()) {
            clearInterval(interval);
        }
        this.intervalsByCheckerId.clear();
    }

    /**
     * Выполняет проверку и уведомляет провайдеров при изменении статуса.
     */
    private async runCheck(checker: BaseChecker) {
        const run = await checker.run();
        if (!run) return;
        const { result, previousIsUp, statusChanged, shouldNotify } = run;

        try {
            void this.onCheckRun?.({ checker, result, previousIsUp, statusChanged, shouldNotify });
        } catch { }

        if (statusChanged) {
            console.log(
                `Изменение статуса для ${this.logLabel(checker)}: ${result.isUp ? 'ДОСТУПЕН' : 'НЕДОСТУПЕН'}`
            );
        }

        if (shouldNotify) {
            await this.sendAlert(result);
        } else if (!result.isUp && previousIsUp === false && this.downReminderIntervalMs > 0) {
            const last = checker.lastDownAlertAt;
            if (last !== undefined && Date.now() - last >= this.downReminderIntervalMs) {
                checker.lastDownAlertAt = Date.now();
                const repeatMessage = result.message ? `[Повтор, всё ещё DOWN] ${result.message}` : '[Повтор, всё ещё DOWN]';
                await this.sendAlert({
                    ...result,
                    message: repeatMessage,
                    timestamp: new Date(),
                });
                console.log(`Повтор алерта (DOWN) для ${this.logLabel(checker)}`);
            }
        }
    }

    /**
     * Рассылает уведомление всем настроенным провайдерам алертов.
     */
    public async sendAlert(result: ICheckResult) {
        const promises = this.alertProviders.map((provider) => provider.sendAlert(result));
        await Promise.allSettled(promises);
    }

    /**
     * Текущие статусы по каждому чекеру (ключ — UUID экземпляра).
     */
    public getStatus(): { id: string; name: string; up: boolean }[] {
        return this.checkers.map((c) => ({
            id: c.id,
            name: c.name,
            up: c.lastIsUp ?? true,
        }));
    }
}
