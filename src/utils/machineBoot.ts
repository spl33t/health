import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

/**
 * Событие, связанное с запуском/перезагрузкой машины (хоста), на котором работает Health Monitor.
 *
 * Важно:
 * - детект основан на `boot_id` Linux (`/proc/sys/kernel/random/boot_id`)
 * - работает только на Linux; на других ОС событие не генерируется
 * - чтобы понимать “был ли ребут”, используется локальный state-файл (JSON)
 */
export type MachineBootEvent = {
    /**
     * Тип события.
     * - `health_app_first_run`: первое наблюдение `boot_id` этим приложением (state-файл отсутствовал/сброшен)
     * - `reboot`: `boot_id` изменился относительно сохранённого (перезагрузка/включение машины)
     */
    kind: 'health_app_first_run' | 'reboot';
    /**
     * Текущий `boot_id` хоста.
     */
    bootId: string;
    /**
     * Предыдущий `boot_id`, сохранённый в state-файле (если был).
     */
    previousBootId?: string;
    /**
     * Время загрузки машины (если удалось извлечь из `/proc/stat` через `btime`).
     */
    bootTime?: Date;
    /**
     * Uptime машины в секундах в момент наблюдения.
     */
    hostUptimeSeconds: number;
    /**
     * Время, когда событие было зафиксировано приложением (локальное время процесса).
     */
    observedAt: Date;
};

type MachineState = {
    lastBootId?: string;
    updatedAt?: string;
};

async function readLinuxBootId(): Promise<string | undefined> {
    if (os.platform() !== 'linux') return;
    try {
        const bootId = await fs.readFile('/proc/sys/kernel/random/boot_id', 'utf8');
        const trimmed = bootId.trim();
        return trimmed ? trimmed : undefined;
    } catch {
        return;
    }
}

async function readLinuxBootTime(): Promise<Date | undefined> {
    if (os.platform() !== 'linux') return;
    try {
        const stat = await fs.readFile('/proc/stat', 'utf8');
        const match = stat.match(/^btime\s+(\d+)\s*$/m);
        const epochSeconds = match ? parseInt(match[1], 10) : NaN;
        if (!Number.isFinite(epochSeconds) || epochSeconds <= 0) return;
        return new Date(epochSeconds * 1000);
    } catch {
        return;
    }
}

async function readStateJson(stateFilePath: string): Promise<MachineState> {
    try {
        const raw = await fs.readFile(stateFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return {};
        const lastBootId = typeof (parsed as any).lastBootId === 'string' ? String((parsed as any).lastBootId) : undefined;
        const updatedAt = typeof (parsed as any).updatedAt === 'string' ? String((parsed as any).updatedAt) : undefined;
        return { lastBootId, updatedAt };
    } catch {
        return {};
    }
}

async function writeStateJson(stateFilePath: string, state: MachineState): Promise<void> {
    await fs.mkdir(path.dirname(stateFilePath), { recursive: true }).catch(() => { });
    await fs.writeFile(stateFilePath, JSON.stringify(state), 'utf8').catch(() => { });
}

export async function withMachineBootEvent(args: {
    /**
     * Путь к state-файлу (JSON), в котором хранится предыдущий `boot_id`.
     * Если не задано — используется `./state/health-state.json`.
     */
    stateFilePath?: string;
    /**
     * Callback, который будет вызван, когда зафиксирован новый `boot_id` (first run или reboot).
     */
    onEvent: (event: MachineBootEvent) => Promise<void> | void;
}): Promise<boolean> {
    const bootId = await readLinuxBootId();
    if (!bootId) return false;

    const stateFilePath = args.stateFilePath ?? path.join(process.cwd(), 'state', 'health-state.json');
    const state = await readStateJson(stateFilePath);
    const previousBootId = state.lastBootId;
    if (previousBootId === bootId) return false;

    await writeStateJson(stateFilePath, { lastBootId: bootId, updatedAt: new Date().toISOString() });

    const bootTime = await readLinuxBootTime();
    const hostUptimeSeconds = os.uptime();
    const observedAt = new Date();
    const kind: MachineBootEvent['kind'] = previousBootId ? 'reboot' : 'health_app_first_run';

    try {
        await args.onEvent({
            kind,
            bootId,
            previousBootId,
            bootTime,
            hostUptimeSeconds,
            observedAt,
        });
    } catch {
        return true;
    }

    return true;
}
