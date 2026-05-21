export type HttpTargetConfig = {
    url: string;
    intervalMs?: number;
};

export type UserConfig = {
    telegramEnabled: boolean;
    telegramBotToken: string;
    telegramChatId: string;

    emailEnabled: boolean;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    emailFrom: string;
    emailToList: string[];

    httpTargets: HttpTargetConfig[];

    diskThresholdPercent: number;
    diskIntervalMs: number;

    ramThresholdPercent: number;
    ramIntervalMs: number;

    cpuThresholdPercent: number;
    cpuIntervalMs: number;

    vkBalanceEnabled: boolean;
    vkCloudEmail: string;
    vkCloudPass: string;
    vkCloudMinBalance: number;
    vkCloudIntervalMs: number;

    dockerEnabled: boolean;
    dockerTargets: string[];
    dockerConfirmThreshold: number;
    dockerSocketPath?: string;
    dockerIntervalMs: number;

    appHealthPingMinutes: any;
};

function parseBool(v: any): boolean {
    return v === true || v === 'true' || v === '1' || v === 1;
}

function parseJsonArray(raw: string): any[] {
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function createUserConfig(env: NodeJS.ProcessEnv): UserConfig {
    const httpTargets = parseJsonArray(env.HTTP_CHECK_TARGETS || '[]')
        .map((t) => {
            const url = typeof (t as any)?.url === 'string' ? String((t as any).url) : '';
            const intervalMs = typeof (t as any)?.intervalMs === 'number' ? (t as any).intervalMs : undefined;
            return url ? { url, intervalMs } : undefined;
        })
        .filter(Boolean) as HttpTargetConfig[];

    const dockerTargetsRaw = env.DOCKER_TARGETS || '["*"]';
    const dockerTargets = parseJsonArray(dockerTargetsRaw)
        .map((t) => (typeof t === 'string' ? t : String(t)))
        .filter(Boolean);

    const emailToList = (env.EMAIL_TO || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    return {
        telegramEnabled: parseBool(env.TELEGRAM_ENABLED),
        telegramBotToken: env.TELEGRAM_BOT_TOKEN || '',
        telegramChatId: env.TELEGRAM_CHAT_ID || '',

        emailEnabled: parseBool(env.EMAIL_ENABLED),
        smtpHost: env.SMTP_HOST || '',
        smtpPort: parseInt(env.SMTP_PORT || '587', 10),
        smtpUser: env.SMTP_USER || '',
        smtpPass: env.SMTP_PASS || '',
        emailFrom: env.EMAIL_FROM || '',
        emailToList,

        httpTargets,

        diskThresholdPercent: parseInt(env.DISK_THRESHOLD_PERCENT || '20', 10),
        diskIntervalMs: parseInt(env.DISK_INTERVAL_MS || '60000', 10),

        ramThresholdPercent: parseInt(env.RAM_THRESHOLD_PERCENT || '15', 10),
        ramIntervalMs: parseInt(env.RAM_INTERVAL_MS || '30000', 10),

        cpuThresholdPercent: parseInt(env.CPU_THRESHOLD_PERCENT || '80', 10),
        cpuIntervalMs: parseInt(env.CPU_INTERVAL_MS || '10000', 10),

        vkBalanceEnabled: parseBool(env.VK_CLOUD_BALANCE_ENABLED),
        vkCloudEmail: env.VK_CLOUD_EMAIL || '',
        vkCloudPass: env.VK_CLOUD_PASS || '',
        vkCloudMinBalance: parseInt(env.VK_CLOUD_MIN_BALANCE || '500', 10),
        vkCloudIntervalMs: parseInt(env.VK_CLOUD_INTERVAL_MS || '3600000', 10),

        dockerEnabled: parseBool(env.DOCKER_CHECK_ENABLED),
        dockerTargets: dockerTargets.length > 0 ? dockerTargets : ['*'],
        dockerConfirmThreshold: parseInt(env.DOCKER_CONFIRM_THRESHOLD || '3', 10),
        dockerSocketPath: (env.DOCKER_SOCKET_PATH || '').trim() || undefined,
        dockerIntervalMs: parseInt(env.DOCKER_INTERVAL_MS || '30000', 10),

        appHealthPingMinutes: env.APP_HEALTH_PING_MINUTES ?? 60,
    };
}

export const config: UserConfig = createUserConfig(process.env);
