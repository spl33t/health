import { CpuChecker } from '../../core/checkers/cpu';
import { DiskChecker } from '../../core/checkers/disk';
import { createDockerContainerCheckers } from '../../core/checkers/docker';
import { HttpChecker } from '../../core/checkers/http';
import { RamChecker } from '../../core/checkers/ram';
import { ThisAppChecker } from '../../core/checkers/this-app';
import { VkCloudBalanceChecker } from '../../core/checkers/vk-cloud-balance';
import { defineChecker, type CheckerState } from '../../core/health';
import { minutesToMs } from '../../core/utils/parseHours';
import { config } from '../config';

export const httpCheckers: CheckerState[] = config.httpTargets.map((t, i) => {
    const intervalMs = typeof t.intervalMs === 'number' && t.intervalMs > 0 ? t.intervalMs : 60000;
    return defineChecker({ uniqueName: `http.${i + 1}`, checker: new HttpChecker(t.url, intervalMs) });
});

export const disk = defineChecker({ uniqueName: 'disk.main', checker: new DiskChecker(config.diskThresholdPercent, config.diskIntervalMs) });

export const ram = defineChecker({ uniqueName: 'ram.main', checker: new RamChecker(config.ramThresholdPercent, config.ramIntervalMs) });
export const cpu = defineChecker({ uniqueName: 'cpu.main', checker: new CpuChecker(config.cpuThresholdPercent, config.cpuIntervalMs) });


export const vkBalance = defineChecker(
    {
        uniqueName: 'vk.balance',
        checker: config.vkBalanceEnabled && config.vkCloudEmail && config.vkCloudPass
            ? new VkCloudBalanceChecker(config.vkCloudEmail, config.vkCloudPass, config.vkCloudMinBalance, config.vkCloudIntervalMs)
            : undefined,
        reason: 'vk balance checker disabled or not configured',
    }
);

export async function getDockerCheckers(): Promise<CheckerState[]> {
    if (!config.dockerEnabled) return [];
    try {
        const dockerCheckers = await createDockerContainerCheckers(
            config.dockerSocketPath,
            config.dockerTargets,
            config.dockerConfirmThreshold,
            config.dockerIntervalMs
        );
        return dockerCheckers.map((c, i) => defineChecker({ uniqueName: `docker.${i + 1}`, checker: c }));
    } catch {
        return [];
    }
}

const healthPingIntervalMs = minutesToMs(config.appHealthPingMinutes, 60);
export const appHealth = defineChecker(
    {
        uniqueName: 'app.health',
        checker: healthPingIntervalMs > 0 ? new ThisAppChecker(healthPingIntervalMs) : undefined,
        reason: 'app health checker disabled',
    }
);
