import { ICheckResult } from '../types';

export abstract class BaseAlertProvider {
    abstract name: string;
    abstract sendAlert(result: ICheckResult): Promise<void>;
    abstract sendMessage(message: string): Promise<void>;

    protected formatSendError(error: any): string {
        return (error?.response?.data && typeof error.response.data === 'string')
            ? error.response.data
            : error?.response?.data
                ? JSON.stringify(error.response.data)
                : error?.message
                    ? String(error.message)
                    : String(error);
    }
}

