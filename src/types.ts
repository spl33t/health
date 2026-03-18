export interface ICheckResult {
    target: string;
    isUp: boolean;
    status?: number;
    message?: string;
    timestamp: Date;
}

export interface IAlertProvider {
    name: string;
    sendAlert(result: ICheckResult): Promise<void>;
}

export interface IChecker {
    name: string;
    intervalMs: number;
    check(): Promise<ICheckResult>;
}

export interface IMonitorConfig {
    checkers: IChecker[];
    alertProviders: IAlertProvider[];
}
