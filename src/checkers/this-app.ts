import { randomUUID } from 'crypto';
import { IChecker, ICheckResult } from '../types';
import { formatUptime } from '../utils/formatTimeMoscow';

export class ThisAppChecker implements IChecker {
    readonly id = randomUUID();
    readonly name = 'App health';
    readonly notifyAlways = true;
    private isFirstRun = true;

    constructor(public intervalMs: number) { }

    async check(): Promise<ICheckResult> {
        const timestamp = new Date();
        const uptime = formatUptime(process.uptime());
        const prefix = this.isFirstRun ? 'health service started.' : '';
        this.isFirstRun = false;
        return {
            checkerName: this.name,
            target: 'Health Monitor',
            isUp: true,
            message: `${prefix} app health is  ok! uptime: ${uptime}`,
            timestamp,
        };
    }
}
