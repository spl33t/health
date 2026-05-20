import { BaseChecker } from './base-checker';
import { ICheckResult } from '../types';
import { formatUptime } from '../utils/formatTimeMoscow';

export class ThisAppChecker extends BaseChecker {
    readonly name = 'App health';
    private isFirstRun = true;

    constructor(intervalMs: number) {
        super(intervalMs, { notifyAlways: true });
    }

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
