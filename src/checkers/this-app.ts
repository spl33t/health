import { randomUUID } from 'crypto';
import { IChecker, ICheckResult } from '../types';
import { formatUptime } from '../utils/formatTimeMoscow';

export class ThisAppChecker implements IChecker {
    readonly id = randomUUID();
    readonly name = 'App health';
    readonly notifyAlways = true;

    constructor(public intervalMs: number) { }

    async check(): Promise<ICheckResult> {
        const timestamp = new Date();
        return {
            checkerName: this.name,
            target: 'Health Monitor',
            isUp: true,
            message: `app health is  ok! uptime: ${formatUptime(process.uptime())}`,
            timestamp,
        };
    }
}
