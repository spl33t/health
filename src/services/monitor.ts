import { ICheckResult, IChecker, IAlertProvider } from '../types';

/**
 * Сервис мониторинга, отвечающий за периодическую проверку целей
 * и уведомление провайдеров алертов при изменении статуса.
 */
export class MonitorService {
    private checkers: IChecker[];
    private alertProviders: IAlertProvider[];
    // Хранит текущий статус каждого сервиса (true = UP, false = DOWN)
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

    /**
     * Запускает цикл мониторинга для всех настроенных чекеров.
     */
    public start() {
        console.log('Запуск службы мониторинга...');
        this.checkers.forEach((checker) => {
            // Изначально считаем, что сервис доступен
            this.statusMap.set(checker.name, true);
            this.runCheck(checker);
            // Установка интервала для последующих проверок
            setInterval(() => this.runCheck(checker), checker.intervalMs);
        });
    }

    /**
     * Выполняет проверку и уведомляет провайдеров при изменении статуса.
     */
    private async runCheck(checker: IChecker) {
        const key = checker.name;
        if (this.checkInFlight.has(key)) {
            return;
        }
        this.checkInFlight.add(key);
        try {
            const result = await checker.check();

            const previousStatus = this.statusMap.get(checker.name);
            if (result.isUp !== previousStatus) {
                this.statusMap.set(checker.name, result.isUp);

                console.log(`Изменение статуса для ${checker.name}: ${result.isUp ? 'ДОСТУПЕН' : 'НЕДОСТУПЕН'}`);
                await this.notifyProviders(result);
                if (result.isUp) {
                    this.lastDownAlertAt.delete(checker.name);
                } else {
                    this.lastDownAlertAt.set(checker.name, Date.now());
                }
            } else if (
                !result.isUp &&
                previousStatus === false &&
                this.downReminderIntervalMs > 0
            ) {
                const last = this.lastDownAlertAt.get(checker.name);
                if (last !== undefined && Date.now() - last >= this.downReminderIntervalMs) {
                    this.lastDownAlertAt.set(checker.name, Date.now());
                    const repeatMessage = result.message
                        ? `[Повтор, всё ещё DOWN] ${result.message}`
                        : '[Повтор, всё ещё DOWN]';
                    await this.notifyProviders({
                        ...result,
                        message: repeatMessage,
                        timestamp: new Date(),
                    });
                    console.log(`Повтор алерта (DOWN) для ${checker.name}`);
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
     * Возвращает текущую карту статусов всех сервисов.
     */
    public getStatus() {
        return Object.fromEntries(this.statusMap);
    }
}
