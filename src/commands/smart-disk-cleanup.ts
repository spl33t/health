import { spawn } from 'child_process';
import os from 'os';
import { BaseCommand } from './base-command';

/**
 * Аргументы “умной” очистки диска.
 * Команда выполняет набор относительно безопасных шагов и после каждого шага проверяет
 * свободное место, чтобы остановиться, как только цель достигнута.
 */
export type SmartDiskCleanupArgs = {
    /**
     * Путь, по которому измерять свободное место (используется `df`).
     * Обычно `/` или конкретный маунт (`/var`, `/var/lib/docker`).
     * По умолчанию: `/`.
     */
    targetPath?: string;
    /**
     * Целевой минимум свободного места (в процентах), при достижении которого очистка прекращается.
     * Пример: `25` означает “остановиться, когда свободно >= 25%”.
     * По умолчанию: `25`.
     */
    stopWhenFreePercentAtLeast?: number;
    /**
     * Сколько дней логов journald оставить.
     * Используется в команде `journalctl --vacuum-time=<days>d`.
     * По умолчанию: `7`.
     */
    journalVacuumDays?: number;
    /**
     * Включить `apt-get clean` (очистка кэша пакетов).
     * По умолчанию: `true`.
     */
    aptClean?: boolean;
    /**
     * Минимальный объём build-cache, который Docker должен оставить.
     * Используется в `docker builder prune --keep-storage <value>`.
     * Примеры значений: `1GB`, `10GB`, `500MB` (зависит от поддержки в docker).
     * По умолчанию: `10GB`.
     */
    dockerBuilderKeepStorage?: string;
};

type ExecResult = { code: number; stdout: string; stderr: string };

function execCmd(cmd: string, args: string[], timeoutMs: number): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => (stdout += chunk));
        child.stderr.on('data', (chunk) => (stderr += chunk));
        child.on('error', reject);
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
        }, timeoutMs);
        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({ code: code ?? 0, stdout: stdout.trim(), stderr: stderr.trim() });
        });
    });
}

async function hasCommand(cmd: string): Promise<boolean> {
    try {
        const res = await execCmd('bash', ['-lc', `command -v ${cmd} >/dev/null 2>&1`], 5000);
        return res.code === 0;
    } catch {
        return false;
    }
}

async function getFreePercent(targetPath: string): Promise<number | undefined> {
    try {
        const res = await execCmd('df', ['-P', '-B1', targetPath], 10000);
        if (res.code !== 0) return;
        const lines = res.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.length < 2) return;
        const parts = lines[1].split(/\s+/);
        if (parts.length < 6) return;
        const total = parseInt(parts[1], 10);
        const available = parseInt(parts[3], 10);
        if (!Number.isFinite(total) || !Number.isFinite(available) || total <= 0) return;
        return (available / total) * 100;
    } catch {
        return;
    }
}

export class SmartDiskCleanupCommand extends BaseCommand<SmartDiskCleanupArgs | undefined, string> {
    /**
     * Запускает “умную” очистку диска.
     * Возвращает текстовый отчёт (что делали и какой эффект по свободному месту).
     *
     * Важно: команда предназначена для Linux (использует `df`, `journalctl`, `apt-get`, `docker`).
     * На Windows возвращает сообщение о неподдерживаемости.
     */
    async execute(args?: SmartDiskCleanupArgs): Promise<string> {
        if (os.platform() === 'win32') {
            return 'SmartDiskCleanupCommand: unsupported on win32';
        }

        const targetPath = (args?.targetPath || '/').trim() || '/';
        const stopWhenFreePercentAtLeast = args?.stopWhenFreePercentAtLeast ?? 25;
        const journalVacuumDays = args?.journalVacuumDays ?? 7;
        const aptClean = args?.aptClean ?? true;
        const dockerBuilderKeepStorage = args?.dockerBuilderKeepStorage ?? '10GB';

        const report: string[] = [];

        const before = await getFreePercent(targetPath);
        if (before !== undefined) {
            report.push(`Disk free before: ${before.toFixed(1)}% (path: ${targetPath})`);
        } else {
            report.push(`Disk free before: unknown (path: ${targetPath})`);
        }

        const steps: Array<{ name: string; run: () => Promise<string | undefined> }> = [];

        steps.push({
            name: 'journalctl vacuum',
            run: async () => {
                if (!(await hasCommand('journalctl'))) return;
                const res = await execCmd('journalctl', [`--vacuum-time=${journalVacuumDays}d`], 120000);
                if (res.code === 0) return res.stdout || 'OK';
                return res.stderr || res.stdout || `exit ${res.code}`;
            },
        });

        steps.push({
            name: 'apt clean',
            run: async () => {
                if (!aptClean) return;
                if (!(await hasCommand('apt-get'))) return;
                const res = await execCmd('apt-get', ['clean'], 120000);
                if (res.code === 0) return res.stdout || 'OK';
                return res.stderr || res.stdout || `exit ${res.code}`;
            },
        });

        steps.push({
            name: 'docker builder prune',
            run: async () => {
                if (!(await hasCommand('docker'))) return;
                const res = await execCmd('docker', ['builder', 'prune', '-f', '--keep-storage', dockerBuilderKeepStorage], 300000);
                if (res.code === 0) return res.stdout || 'OK';
                return res.stderr || res.stdout || `exit ${res.code}`;
            },
        });

        for (const step of steps) {
            const out = await step.run();
            if (out !== undefined) {
                report.push(`${step.name}: ${out}`);
            }

            const now = await getFreePercent(targetPath);
            if (now !== undefined) {
                report.push(`Disk free now: ${now.toFixed(1)}%`);
                if (now >= stopWhenFreePercentAtLeast) {
                    report.push(`Stop: reached ${stopWhenFreePercentAtLeast}% free`);
                    break;
                }
            }
        }

        return report.join('\n');
    }
}
