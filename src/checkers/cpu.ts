import * as os from 'os';
import { IChecker, ICheckResult } from '../types';

/**
 * Чекер для мониторинга загрузки процессора (CPU).
 * Рассчитывает среднюю загрузку по всем ядрам.
 */
export class CpuChecker implements IChecker {
    private lastMeasure = this.getAverageUsage();

    /**
     * @param name — название чекера
     * @param thresholdPercent — порог загрузки в %; алерт при превышении
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
            const currentMeasure = this.getAverageUsage();

            const idleDiff = currentMeasure.idle - this.lastMeasure.idle;
            const totalDiff = currentMeasure.total - this.lastMeasure.total;

            this.lastMeasure = currentMeasure;

            const usagePercent = totalDiff === 0 ? 0 : 100 - (100 * idleDiff / totalDiff);
            const isOk = usagePercent < this.thresholdPercent;

            return {
                checkerName: this.name,
                target: `CPU (${this.name})`,
                isUp: isOk,
                message: isOk
                    ? `Загрузка: ${usagePercent.toFixed(1)}%`
                    : `ВЫСОКАЯ НАГРУЗКА CPU! Загрузка: ${usagePercent.toFixed(1)}%. Порог: ${this.thresholdPercent}%`,
                timestamp,
            };
        } catch (error: any) {
            return {
                checkerName: this.name,
                target: `CPU (${this.name})`,
                isUp: false,
                message: `Ошибка проверки CPU: ${error.message}`,
                timestamp,
            };
        }
    }

    private getAverageUsage() {
        const cpus = os.cpus();
        let idle = 0;
        let total = 0;

        cpus.forEach((core) => {
            for (const type in core.times) {
                total += (core.times as any)[type];
            }
            idle += core.times.idle;
        });

        return {
            idle: idle / cpus.length,
            total: total / cpus.length
        };
    }
}
