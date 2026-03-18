import axios from 'axios';
import { IAlertProvider, ICheckResult } from '../types';

export class TelegramProvider implements IAlertProvider {
    name = 'Telegram';
    private botToken: string;
    private chatId: string;

    constructor(botToken: string, chatId: string) {
        this.botToken = botToken;
        this.chatId = chatId;
    }

    async sendAlert(result: ICheckResult): Promise<void> {
        const statusText = result.isUp ? '✅ UP' : '🚨 DOWN';
        const message = `
<b>Service Alert</b>: ${result.target} is ${statusText}
<b>Status</b>: ${result.status || 'N/A'}
<b>Message</b>: ${result.message || 'No message'}
<b>Time</b>: ${result.timestamp.toISOString()}
    `.trim();

        try {
            await axios.post(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
                chat_id: this.chatId,
                text: message,
                parse_mode: 'HTML',
            });
        } catch (error: any) {
            console.error('Failed to send Telegram alert:', error.response?.data || error.message);
        }
    }
}
