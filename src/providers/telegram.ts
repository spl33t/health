import axios from 'axios';
import { ICheckResult } from '../types';
import { formatTimeMoscow } from '../utils/formatTimeMoscow';
import { BaseAlertProvider } from './base-provider';

export class TelegramProvider extends BaseAlertProvider {
    name = 'Telegram';
    private botToken: string;
    private chatId: string;

    constructor(botToken: string, chatId: string) {
        super();
        this.botToken = botToken;
        this.chatId = chatId;
    }

    async sendMessage(message: string): Promise<void> {
        try {
            await axios.post(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
                chat_id: this.chatId,
                text: message,
            });
        } catch (error: any) {
            console.error('Failed to send Telegram message:', this.formatSendError(error));
        }
    }

    async sendAlert(result: ICheckResult): Promise<void> {
        const statusText = result.isUp ? '✅ UP' : '🚨 DOWN';
        const checkerLine = `<b>Checker</b>: ${result.checkerName}\n<b>Target</b>: ${result.target}`;
        const message = `
<b>Service Alert</b> — ${statusText}
${checkerLine}
<b>Status</b>: ${result.status ?? 'N/A'}
<b>Message</b>: ${result.message || 'No message'}
<b>Time</b>: ${formatTimeMoscow(result.timestamp)}
    `.trim();

        try {
            await axios.post(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
                chat_id: this.chatId,
                text: message,
                parse_mode: 'HTML',
            });
        } catch (error: any) {
            console.error('Failed to send Telegram alert:', this.formatSendError(error));
        }
    }
}
