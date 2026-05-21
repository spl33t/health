import { randomUUID } from 'crypto';
import { ICheckResult } from '../types';

/**
 * Дополнительные настройки чекера, которые задаются при создании экземпляра.
 */
export type BaseCheckerOptions = {
    /**
     * Если true — результат проверки отправляется провайдерам каждый запуск чекера,
     * даже если `isUp` не изменился (подходит для heartbeat).
     */
    notifyAlways?: boolean;
    /**
     * Хук, который выполняется при переходе статуса чекера в DOWN (UP → DOWN).
     * Вызывается строго один раз на смену статуса, а не на каждой итерации при устойчивом DOWN.
     * Ошибка внутри хука подавляется базовым классом.
     */
    onDown?: (result: ICheckResult) => Promise<void> | void;
};

/**
 * Базовый класс для всех чекеров.
 * Отвечает за хранение состояния, сериализацию запусков и вызов хуков жизненного цикла.
 */
export abstract class BaseChecker {
    /**
     * Стабильный UUID экземпляра чекера (используется как ключ в мониторинге и логах).
     */
    readonly id: string = randomUUID();
    /**
     * Человекочитаемое имя/тип чекера (Disk, HTTP, Docker, ...).
     * Используется в алертах как `checkerName`.
     */
    abstract readonly name: string;
    /**
     * Если true — уведомления отправляются на каждом запуске чекера,
     * даже если статус не менялся.
     */
    readonly notifyAlways?: boolean;
    /**
     * Хук, вызываемый при переходе в DOWN (UP → DOWN).
     */
    readonly onDown?: (result: ICheckResult) => Promise<void> | void;
    /**
     * Интервал между проверками в миллисекундах (используется таймером мониторинга).
     */
    intervalMs: number;
    /**
     * Последний зафиксированный статус чекера.
     * `undefined` означает, что чекер ещё ни разу не выполнялся.
     */
    lastIsUp: boolean | undefined;
    /**
     * Время (ms since epoch) последнего DOWN-алерта (первичного) — нужно для механизма повторов.
     * `undefined` означает, что DOWN сейчас не активен или ещё не фиксировался.
     */
    lastDownAlertAt: number | undefined;
    /**
     * Флаг защиты от параллельных запусков: если предыдущая проверка ещё выполняется,
     * повторный запуск пропускается.
     */
    checkInFlight: boolean = false;

    /**
     * @param intervalMs интервал проверки в миллисекундах
     * @param options дополнительные настройки: notifyAlways/onDown
     */
    protected constructor(intervalMs: number, options?: BaseCheckerOptions) {
        this.intervalMs = intervalMs;
        this.notifyAlways = options?.notifyAlways;
        this.onDown = options?.onDown;
    }

    /**
     * Реальная проверка, реализуется в конкретном чекере.
     * Должна вернуть `ICheckResult` с корректным `isUp`.
     */
    abstract check(): Promise<ICheckResult>;

    /**
     * Безопасный запуск проверки с обновлением состояния чекера.
     * - не допускает параллельных запусков (возвращает `undefined`, если запуск уже идёт)
     * - обновляет `lastIsUp/lastDownAlertAt`
     * - вызывает `onDown` при переходе в DOWN
     *
     * @returns объект с результатом и вычисленными флагами, либо `undefined` если запуск пропущен
     */
    async run(): Promise<
        | {
            result: ICheckResult;
            previousIsUp: boolean | undefined;
            statusChanged: boolean;
            shouldNotify: boolean;
        }
        | undefined
    > {
        if (this.checkInFlight) return;
        this.checkInFlight = true;
        try {
            const result = await this.check();
            const previousIsUp = this.lastIsUp;
            const statusChanged = result.isUp !== previousIsUp;
            const shouldNotify = statusChanged || this.notifyAlways === true;

            if (statusChanged) {
                this.lastIsUp = result.isUp;
                if (result.isUp) {
                    this.lastDownAlertAt = undefined;
                } else {
                    this.lastDownAlertAt = Date.now();
                    try {
                        await this.onDown?.(result);
                    } catch (e) { }
                }
            }

            return { result, previousIsUp, statusChanged, shouldNotify };
        } finally {
            this.checkInFlight = false;
        }
    }
}
