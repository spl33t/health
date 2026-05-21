import { spawn } from 'child_process';
import os from 'os';
import { BaseCommand } from './base-command';

export type DockerComposeRestartArgs = {
    /**
     * Рабочая директория, в которой выполнять `docker compose ...`.
     * Обычно это папка, где лежит `docker-compose.yml`.
     * Если не задано — используется текущая директория процесса.
     */
    cwd?: string;
    /**
     * Список compose-файлов (аналог `-f docker-compose.yml`).
     * Можно передать несколько файлов — они будут применены по порядку.
     * Пример: `['docker-compose.yml', 'docker-compose.prod.yml']`.
     */
    composeFiles?: string[];
    /**
     * Имя проекта docker compose (аналог `-p <name>`).
     * Влияет на префиксы имён контейнеров/сети.
     */
    projectName?: string;
    /**
     * Запускать `up` в фоне (аналог `docker compose up -d`).
     * По умолчанию: `true`.
     */
    detach?: boolean;
    /**
     * Список сервисов для `up` (например, `['api', 'db']`).
     * Если не задано — поднимает все сервисы.
     */
    services?: string[];
};

type ExecResult = { code: number; stdout: string; stderr: string };

function execCmd(cmd: string, args: string[], cwd?: string): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd });

        let stdout = '';
        let stderr = '';

        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');

        child.stdout.on('data', (chunk) => (stdout += chunk));
        child.stderr.on('data', (chunk) => (stderr += chunk));

        child.on('error', reject);
        child.on('close', (code) => resolve({ code: code ?? 0, stdout: stdout.trim(), stderr: stderr.trim() }));
    });
}

async function detectComposeCommand(cwd?: string): Promise<{ cmd: string; baseArgs: string[] } | undefined> {
    const dockerRes = await execCmd('docker', ['compose', 'version'], cwd).catch(() => undefined);
    if (dockerRes && dockerRes.code === 0) return { cmd: 'docker', baseArgs: ['compose'] };

    const legacyRes = await execCmd('docker-compose', ['version'], cwd).catch(() => undefined);
    if (legacyRes && legacyRes.code === 0) return { cmd: 'docker-compose', baseArgs: [] };

    return;
}

export class DockerComposeRestartCommand extends BaseCommand<DockerComposeRestartArgs | undefined, string> {
    async execute(args?: DockerComposeRestartArgs): Promise<string> {
        if (os.platform() === 'win32') {
            return 'DockerComposeRestartCommand: unsupported on win32';
        }

        const cwd = args?.cwd;
        const composeFiles = args?.composeFiles ?? [];
        const projectName = args?.projectName;
        const detach = args?.detach ?? true;
        const services = args?.services ?? [];

        const compose = await detectComposeCommand(cwd);
        if (!compose) {
            throw new Error('docker compose is not available (neither "docker compose" nor "docker-compose")');
        }

        const commonArgs: string[] = [...compose.baseArgs];
        for (const file of composeFiles) {
            if (file) commonArgs.push('-f', file);
        }
        if (projectName) commonArgs.push('-p', projectName);

        const down = await execCmd(compose.cmd, [...commonArgs, 'down'], cwd);
        if (down.code !== 0) {
            throw new Error((down.stderr || down.stdout || `docker compose down exited with code ${down.code}`).trim());
        }

        const upArgs = [...commonArgs, 'up'];
        if (detach) upArgs.push('-d');
        if (services.length > 0) upArgs.push(...services);

        const up = await execCmd(compose.cmd, upArgs, cwd);
        if (up.code !== 0) {
            throw new Error((up.stderr || up.stdout || `docker compose up exited with code ${up.code}`).trim());
        }

        const lines: string[] = [];
        if (down.stdout) lines.push(down.stdout);
        if (down.stderr) lines.push(down.stderr);
        if (up.stdout) lines.push(up.stdout);
        if (up.stderr) lines.push(up.stderr);
        return lines.join('\n').trim() || 'OK';
    }
}
