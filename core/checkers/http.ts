import axios from 'axios';
import { BaseChecker } from './base-checker';
import { ICheckResult } from '../types';

export class HttpChecker extends BaseChecker {
    readonly name = 'HTTP';

    /**
     * @param url — URL для HTTP-проверки
     * @param intervalMs — интервал проверки в миллисекундах
     */
    constructor(
        public url: string,
        intervalMs: number
    ) {
        super(intervalMs);
    }

    async check(): Promise<ICheckResult> {
        const timestamp = new Date();
        try {
            const response = await axios.get(this.url, { timeout: 5000 });
            return {
                checkerName: this.name,
                target: this.url,
                isUp: response.status >= 200 && response.status < 300,
                status: response.status,
                timestamp,
            };
        } catch (error: any) {
            return {
                checkerName: this.name,
                target: this.url,
                isUp: false,
                status: error.response?.status ?? 0,
                message: error.message,
                timestamp,
            };
        }
    }
}
