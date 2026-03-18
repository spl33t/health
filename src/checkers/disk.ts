import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import { IChecker, ICheckResult } from '../types';

const execAsync = promisify(exec);

export class DiskChecker implements IChecker {
    /**
     * @param name — название чекера
     * @param thresholdPercent — порог свободного места в %; алерт при падении ниже
     * @param intervalMs — интервал проверки в миллисекундах
     * @param drive — необязательно: диск для проверки ('C:' или '/'); если не указан — проверяются все диски
     */
    constructor(
        public name: string,
        public thresholdPercent: number,
        public intervalMs: number,
        public drive?: string
    ) { }

    async check(): Promise<ICheckResult> {
        const timestamp = new Date();
        const platform = os.platform();

        try {
            let disksInfo: { drive: string, free: number, total: number }[] = [];

            if (platform === 'win32') {
                const cmd = this.drive
                    ? `wmic logicaldisk where "DeviceID='${this.drive}'" get deviceid,size,freespace`
                    : `wmic logicaldisk get deviceid,size,freespace`;

                const { stdout } = await execAsync(cmd);
                const lines = stdout.trim().split(/\r?\n/).filter(line => line.trim() !== '');

                // Пропускаем заголовок
                for (let i = 1; i < lines.length; i++) {
                    const stats = lines[i].trim().split(/\s+/);
                    if (stats.length >= 3) {
                        disksInfo.push({
                            drive: stats[0],
                            free: parseInt(stats[1]),
                            total: parseInt(stats[2])
                        });
                    }
                }
            } else {
                const cmd = this.drive ? `df -B1 ${this.drive}` : `df -B1 --local`;
                const { stdout } = await execAsync(cmd);
                const lines = stdout.trim().split('\n').filter(line => line.trim() !== '');

                for (let i = 1; i < lines.length; i++) {
                    const stats = lines[i].trim().split(/\s+/);
                    if (stats.length >= 6) {
                        disksInfo.push({
                            drive: stats[5], // Mount point
                            free: parseInt(stats[3]),
                            total: parseInt(stats[1])
                        });
                    }
                }
            }

            if (disksInfo.length === 0) throw new Error('Не удалось получить информацию о дисках');

            const results = disksInfo.map(d => {
                const freePercent = (d.free / d.total) * 100;
                return {
                    ...d,
                    freePercent,
                    isLow: freePercent < this.thresholdPercent
                };
            });

            const lowDisks = results.filter(r => r.isLow);
            const isAllOk = lowDisks.length === 0;

            const message = results.map(r =>
                `${r.drive}: ${r.freePercent.toFixed(1)}% своб.`
            ).join(' | ');

            return {
                target: `Disk Monitor (${this.name})`,
                isUp: isAllOk,
                message: isAllOk
                    ? `Все диски в норме: ${message}`
                    : `МАЛО МЕСТА! ${lowDisks.map(d => `${d.drive} (${d.freePercent.toFixed(1)}%)`).join(', ')}. Все: ${message}`,
                timestamp,
            };
        } catch (error: any) {
            return {
                target: `Disk Monitor (${this.name})`,
                isUp: false,
                message: `Ошибка проверки диска: ${error.message}`,
                timestamp,
            };
        }
    }
}
