/**
 * Результат одной проверки чекера для алертов и логики мониторинга.
 */
export interface ICheckResult {
    /**
     * Человекочитаемая цель проверки (URL, имя сервиса, метка диска и т.п.).
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
     * Уникальное имя чекера (совпадает с `IChecker.name`); задаёт сам чекер.
     */
    checkerName: string;
}

export interface IAlertProvider {
    name: string;
    sendAlert(result: ICheckResult): Promise<void>;
}

export interface IChecker {
    name: string;
    intervalMs: number;
    check(): Promise<ICheckResult>;
}

export interface IMonitorConfig {
    checkers: IChecker[];
    alertProviders: IAlertProvider[];
}
