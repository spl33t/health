import { ICheckResult, IChecker, IAlertProvider } from '../types';

/**
 * Сервис мониторинга, отвечающий за периодическую проверку целей
 * и уведомление провайдеров алертов при изменении статуса.
 */
export class MonitorService {
    private checkers: IChecker[];
    private alertProviders: IAlertProvider[];
    private statusMap: Map<string, boolean> = new Map();
    /** Время последнего DOWN-алерта (начального или повтора), мс с epoch */
    private lastDownAlertAt: Map<string, number> = new Map();
    /** Не допускаем параллельных runCheck для одного чекера (setInterval без await). */
    private checkInFlight: Set<string> = new Set();

    /**
     * @param downReminderIntervalMs интервал повторной рассылки при устойчивом DOWN (0 — отключено)
     */
    constructor(
        checkers: IChecker[],
        alertProviders: IAlertProvider[],
        private downReminderIntervalMs: number = 0
    ) {
        this.checkers = checkers;
        this.alertProviders = alertProviders;
    }

    private logLabel(checker: IChecker): string {
        return `${checker.name} [${checker.id.slice(0, 8)}]`;
    }

    /**
     * Запускает цикл мониторинга для всех настроенных чекеров.
     */
    public start() {
        console.log('Запуск службы мониторинга...');
        this.checkers.forEach((checker) => {
            this.statusMap.set(checker.id, true);
            this.runCheck(checker);
            setInterval(() => this.runCheck(checker), checker.intervalMs);
        });
    }

    /**
     * Выполняет проверку и уведомляет провайдеров при изменении статуса.
     */
    private async runCheck(checker: IChecker) {
        const key = checker.id;
        if (this.checkInFlight.has(key)) {
            return;
        }
        this.checkInFlight.add(key);
        try {
            const result = await checker.check();

            const previousStatus = this.statusMap.get(checker.id);
            if (result.isUp !== previousStatus) {
                this.statusMap.set(checker.id, result.isUp);

                console.log(
                    `Изменение статуса для ${this.logLabel(checker)}: ${result.isUp ? 'ДОСТУПЕН' : 'НЕДОСТУПЕН'}`
                );
                await this.notifyProviders(result);
                if (result.isUp) {
                    this.lastDownAlertAt.delete(checker.id);
                } else {
                    this.lastDownAlertAt.set(checker.id, Date.now());
                }
            } else if (
                !result.isUp &&
                previousStatus === false &&
                this.downReminderIntervalMs > 0
            ) {
                const last = this.lastDownAlertAt.get(checker.id);
                if (last !== undefined && Date.now() - last >= this.downReminderIntervalMs) {
                    this.lastDownAlertAt.set(checker.id, Date.now());
                    const repeatMessage = result.message
                        ? `[Повтор, всё ещё DOWN] ${result.message}`
                        : '[Повтор, всё ещё DOWN]';
                    await this.notifyProviders({
                        ...result,
                        message: repeatMessage,
                        timestamp: new Date(),
                    });
                    console.log(`Повтор алерта (DOWN) для ${this.logLabel(checker)}`);
                }
            }
        } finally {
            this.checkInFlight.delete(key);
        }
    }

    /**
     * Рассылает уведомление всем настроенным провайдерам алертов.
     */
    private async notifyProviders(result: ICheckResult) {
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
            up: this.statusMap.get(c.id) ?? true,
        }));
    }
}
