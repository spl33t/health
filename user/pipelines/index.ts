import { SmartDiskCleanupCommand } from '../../core/commands/smart-disk-cleanup';
import { definePipeline, healthEvents } from '../../core/health';
import { ICheckResult } from '../../core/types';
import { formatTimeMoscow, formatUptime } from '../../core/utils/formatTimeMoscow';
import { disk } from '../checkers';

export const diskSmartCleanup = definePipeline({
    uniqueName: 'disk.smart_cleanup',
    enabled: true,
    on: [disk.events.down],
    run: async (event, ctx) => {
        const command = new SmartDiskCleanupCommand();
        const output = await command.execute({
            targetPath: '/',
            stopWhenFreePercentAtLeast: 25,
            journalVacuumDays: 30,
            aptClean: true,
            dockerBuilderKeepStorage: '2GB',
        });
        const message = `Disk DOWN detected.\nTime: ${event.at.toISOString()}\n\n${output}`;
        await ctx.sendMessage(message);
    },
});

export const machineRebootNotify = definePipeline({
    uniqueName: 'machine.reboot_notify',
    enabled: true,
    on: [healthEvents.machine.reboot],
    run: async (event, ctx) => {
        const e = event.payload;
        const lines: string[] = [];
        lines.push('Обнаружена перезагрузка машины (boot_id изменился).');
        if (e.previousBootId) lines.push(`Предыдущий boot_id: ${e.previousBootId}`);
        lines.push(`Текущий boot_id: ${e.bootId}`);
        lines.push(`Uptime хоста: ${formatUptime(e.hostUptimeSeconds)}`);
        if (e.bootTime) lines.push(`Время загрузки: ${formatTimeMoscow(e.bootTime)}`);
        lines.push(`Время запуска Health Monitor: ${event.at.toISOString()}`);
        await ctx.sendMessage(lines.join('\n'));
    },
});

export const machineFirstRunNotify = definePipeline({
    uniqueName: 'machine.first_run_notify',
    enabled: true,
    on: [healthEvents.machine.health_app_first_run],
    run: async (event, ctx) => {
        const e = event.payload;
        const lines: string[] = [];
        lines.push('Health app first run (первое наблюдение boot_id).');
        lines.push(`Текущий boot_id: ${e.bootId}`);
        lines.push(`Uptime хоста: ${formatUptime(e.hostUptimeSeconds)}`);
        if (e.bootTime) lines.push(`Время загрузки: ${formatTimeMoscow(e.bootTime)}`);
        lines.push(`Время запуска Health Monitor: ${event.at.toISOString()}`);
        await ctx.sendMessage(lines.join('\n'));
    },
});

export const appShutdownNotify = definePipeline({
    uniqueName: 'app.shutdown_notify',
    enabled: true,
    on: [healthEvents.app.shutdown],
    run: async (event, ctx) => {
        const payload = event.payload;
        const alert: ICheckResult = {
            checkerName: 'Система',
            target: 'Health Monitor',
            isUp: false,
            message: `Health Monitor остановлен (${payload.signal})`,
            timestamp: new Date(),
        };
        await ctx.sendAlert(alert);
    },
});