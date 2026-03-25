/**
 * Результат одной проверки чекера для алертов и логики мониторинга.
 */
export interface ICheckResult {
    /**
     * Что проверялось: для HTTP — полный URL; для Docker — имя контейнера;
     * для дисков — маунт/диск или «все локальные»; для CPU/RAM — узел и т.п.
     */
    target: string;

    /**
     * Текущее состояние: `true` — в порядке, `false` — проблема (после порогов подтверждения, если применимо).
     */
    isUp: boolean;

    /**
     * Дополнительный код состояния: HTTP-статус для URL-проверок; для Docker — строка из API
     * (например `running (health: healthy)`, `exited`). Может отсутствовать.
     */
    status?: number | string;

    /**
     * Текст с деталями: ошибка, метрики, причина сбоя.
     */
    message?: string;

    /**
     * Время фиксации результата проверки.
     */
    timestamp: Date;

    /**
     * Тип чекера для алертов (HTTP, Docker, CPU, …); совпадает с `IChecker.name`.
     */
    checkerName: string;
}

export interface IAlertProvider {
    name: string;
    sendAlert(result: ICheckResult): Promise<void>;
}

export interface IChecker {
    /** Стабильный UUID экземпляра (ключи монитора, логи). */
    readonly id: string;
    /** Человекочитаемый тип чекера для алертов (HTTP, Docker, …). */
    readonly name: string;
    intervalMs: number;
    check(): Promise<ICheckResult>;
}

export interface IMonitorConfig {
    checkers: IChecker[];
    alertProviders: IAlertProvider[];
}
