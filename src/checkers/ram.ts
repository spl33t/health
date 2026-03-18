import * as os from 'os';
import { IChecker, ICheckResult } from '../types';

/**
 * Чекер для мониторинга свободной оперативной памяти (RAM).
 */
export class RamChecker implements IChecker {
    /**
     * @param name — название чекера
     * @param thresholdPercent — порог свободной памяти в %; алерт при падении ниже
     * @param intervalMs — интервал проверки в миллисекундах
     */
    constructor(
        public name: string,
        public thresholdPercent: number,
        public intervalMs: number
    ) { }

    async check(): Promise<ICheckResult> {
        const timestamp = new Date();
        try {
            const totalMemory = os.totalmem();
            const freeMemory = os.freemem();

            const freePercent = (freeMemory / totalMemory) * 100;
            const isOk = freePercent > this.thresholdPercent;

            const freeMB = (freeMemory / 1024 / 1024).toFixed(0);
            const totalMB = (totalMemory / 1024 / 1024).toFixed(0);

            return {
                target: `RAM (${this.name})`,
                isUp: isOk,
                message: isOk
                    ? `Свободно: ${freePercent.toFixed(1)}% (${freeMB}MB из ${totalMB}MB)`
                    : `МАЛО ПАМЯТИ! Свободно: ${freePercent.toFixed(1)}% (${freeMB}MB из ${totalMB}MB). Порог: ${this.thresholdPercent}%`,
                timestamp,
            };
        } catch (error: any) {
            return {
                target: `RAM (${this.name})`,
                isUp: false,
                message: `Ошибка проверки RAM: ${error.message}`,
                timestamp,
            };
        }
    }
}
