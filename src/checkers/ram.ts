import { randomUUID } from 'crypto';
import * as os from 'os';
import { IChecker, ICheckResult } from '../types';

/**
 * Чекер для мониторинга свободной оперативной памяти (RAM).
 */
export class RamChecker implements IChecker {
    readonly id = randomUUID();
    readonly name = 'RAM';

    /**
     * @param thresholdPercent — порог свободной памяти в %; алерт при падении ниже
     * @param intervalMs — интервал проверки в миллисекундах
     */
    constructor(
        public thresholdPercent: number,
        public intervalMs: number
    ) {}

    async check(): Promise<ICheckResult> {
        const timestamp = new Date();
        const target = os.hostname();
        try {
            const totalMemory = os.totalmem();
            const freeMemory = os.freemem();

            const freePercent = (freeMemory / totalMemory) * 100;
            const isOk = freePercent > this.thresholdPercent;

            const freeMB = (freeMemory / 1024 / 1024).toFixed(0);
            const totalMB = (totalMemory / 1024 / 1024).toFixed(0);

            return {
                checkerName: this.name,
                target,
                isUp: isOk,
                message: isOk
                    ? `Свободно: ${freePercent.toFixed(1)}% (${freeMB}MB из ${totalMB}MB)`
                    : `МАЛО ПАМЯТИ! Свободно: ${freePercent.toFixed(1)}% (${freeMB}MB из ${totalMB}MB). Порог: ${this.thresholdPercent}%`,
                timestamp,
            };
        } catch (error: any) {
            return {
                checkerName: this.name,
                target,
                isUp: false,
                message: `Ошибка проверки RAM: ${error.message}`,
                timestamp,
            };
        }
    }
}
