import axios from 'axios';
import { IChecker, ICheckResult } from '../types';

export class HttpChecker implements IChecker {
    /**
     * @param name — название чекера
     * @param url — URL для HTTP-проверки
     * @param intervalMs — интервал проверки в миллисекундах
     */
    constructor(
        public name: string,
        public url: string,
        public intervalMs: number
    ) { }

    async check(): Promise<ICheckResult> {
        const timestamp = new Date();
        try {
            const response = await axios.get(this.url, { timeout: 5000 });
            return {
                checkerName: this.name,
                target: this.name,
                isUp: response.status >= 200 && response.status < 300,
                status: response.status,
                timestamp,
            };
        } catch (error: any) {
            return {
                checkerName: this.name,
                target: this.name,
                isUp: false,
                status: error.response?.status ?? 0,
                message: error.message,
                timestamp,
            };
        }
    }
}
