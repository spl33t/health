import dotenv from 'dotenv';
import { createHealth, type CheckerState, type PipelineState, type ProviderState } from '../core/health';
import { hoursToMs } from '../core/utils/parseHours';
import { registerShutdownHandler } from '../core/utils/shutdown';

dotenv.config();

async function main() {
    const downReminderIntervalMs = hoursToMs(process.env.ALERT_DOWN_REMINDER_HOURS, 1);

    const [
        { httpCheckers, disk, ram, cpu, vkBalance, appHealth, getDockerCheckers },
        { diskSmartCleanup, machineRebootNotify, machineFirstRunNotify, appShutdownNotify },
        { emailMain, telegramMain },
    ] = await Promise.all([
        import('./checkers'),
        import('./pipelines'),
        import('./providers'),
    ]);

    const dockerCheckers = await getDockerCheckers();
    const providers: ProviderState[] = [telegramMain, emailMain];
    const checkers: CheckerState[] = [
        ...httpCheckers,
        disk,
        ram,
        cpu,
        vkBalance,
        appHealth,
        ...dockerCheckers,
    ];
    const pipelines: PipelineState[] = [
        diskSmartCleanup,
        machineRebootNotify,
        machineFirstRunNotify,
        appShutdownNotify,
    ];

    const health = createHealth({
        downReminderIntervalMs,
        providers,
        checkers,
        pipelines,
    });

    registerShutdownHandler({
        onShutdown: async (signal) => {
            await health.shutdown(signal);
        },
        timeoutMs: 5000,
        exitCode: 0,
    });
    await health.start();
}

if (require.main === module) {
    void main();
}
