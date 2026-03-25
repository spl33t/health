import nodemailer from 'nodemailer';
import { IAlertProvider, ICheckResult } from '../types';

export interface EmailProviderConfig {
    host: string;
    port: number;
    user: string;
    pass: string;
    from: string;
    to: string;
    secure?: boolean;
}

export class EmailProvider implements IAlertProvider {
    name = 'Email';
    private transporter: nodemailer.Transporter;
    private from: string;
    private to: string;

    constructor(config: EmailProviderConfig) {
        this.transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure ?? config.port === 465,
            auth: {
                user: config.user,
                pass: config.pass,
            },
        });
        this.from = config.from;
        this.to = config.to;
    }

    async sendAlert(result: ICheckResult): Promise<void> {
        const statusText = result.isUp ? '✅ UP' : '🚨 DOWN';
        const subject = `[Health Monitor] ${result.checkerName} — ${statusText}`;
        const html = `
<h2>Service Alert</h2>
<p><strong>Чекер:</strong> ${result.checkerName}</p>
<p><strong>Target:</strong> ${result.target}</p>
<p><strong>Status:</strong> ${statusText}</p>
<p><strong>HTTP Status:</strong> ${result.status ?? 'N/A'}</p>
<p><strong>Message:</strong> ${result.message ?? 'No message'}</p>
<p><strong>Time:</strong> ${result.timestamp.toISOString()}</p>
        `.trim();

        try {
            await this.transporter.sendMail({
                from: this.from,
                to: this.to,
                subject,
                html,
            });
        } catch (error: any) {
            console.error('Failed to send Email alert:', error.message);
        }
    }
}
