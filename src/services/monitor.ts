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

    constructor(checkers: IChecker[], alertProviders: IAlertProvider[]) {
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
        const result = await checker.check();

        const previousStatus = this.statusMap.get(checker.name);
        // Если статус изменился
        if (result.isUp !== previousStatus) {
            this.statusMap.set(checker.name, result.isUp);

            console.log(`Изменение статуса для ${checker.name}: ${result.isUp ? 'ДОСТУПЕН' : 'НЕДОСТУПЕН'}`);
            // Отправка уведомлений всем зарегистрированным провайдерам
            await this.notifyProviders(result);
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
