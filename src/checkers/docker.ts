import { randomUUID } from 'crypto';
import Docker from 'dockerode';
import { IChecker, ICheckResult } from '../types';

interface ContainerInspectState {
    Status?: string;
    Health?: { Status?: string };
}

function getContainerDisplayName(container: { Names?: string[]; Id?: string; Labels?: Record<string, string> }): string {
    const name = container.Names?.[0]?.replace(/^\//, '') || container.Id?.slice(0, 12) || 'unknown';
    const service = container.Labels?.['com.docker.compose.service'];
    return service || name;
}

/**
 * Точное совпадение имени (не подстрока): compose service, любой из Names, или отображаемое имя.
 */
function matchesTargetPattern(
    container: { Names?: string[]; Id?: string; Labels?: Record<string, string> },
    pattern: string
): boolean {
    if (pattern === '*') return true;

    const service = container.Labels?.['com.docker.compose.service'];
    if (service === pattern) return true;

    for (const n of container.Names || []) {
        if (n.replace(/^\//, '') === pattern) return true;
    }

    return getContainerDisplayName(container) === pattern;
}

/**
 * Проверяет, что контейнер в плохом состоянии (unhealthy, restarting, exited).
 */
function isContainerUnhealthy(inspect: { State?: ContainerInspectState; RestartCount?: number }): boolean {
    const status = inspect.State?.Status || '';
    const healthStatus = inspect.State?.Health?.Status;

    if (status === 'restarting') return true;
    if (status === 'exited') return true;
    if (healthStatus === 'unhealthy') return true;

    return false;
}

function getFailureReason(inspect: { State?: ContainerInspectState; RestartCount?: number }): string {
    const status = inspect.State?.Status || '';
    const healthStatus = inspect.State?.Health?.Status;
    const restartCount = inspect.RestartCount ?? 0;

    if (healthStatus === 'unhealthy') return 'health check failed';
    if (status === 'restarting') return `restart loop (RestartCount: ${restartCount})`;
    if (status === 'exited') return `exited (RestartCount: ${restartCount})`;

    return status;
}

/** Реальный статус контейнера из `docker inspect` для поля `ICheckResult.status`. */
function formatDockerRuntimeStatus(inspect: Docker.ContainerInspectInfo): string {
    const run = inspect.State?.Status ?? 'unknown';
    const health = inspect.State?.Health?.Status;
    if (health) {
        return `${run} (health: ${health})`;
    }
    return run;
}

/**
 * Один контейнер = один чекер: независимый статус и алерты.
 */
export class DockerContainerChecker implements IChecker {
    readonly id = randomUUID();
    readonly name = 'Docker';

    private failureCount = 0;

    constructor(
        private docker: Docker,
        private containerId: string,
        /** Имя контейнера / сервиса в алерте (`target`) */
        private displayTarget: string,
        private confirmThreshold: number,
        public intervalMs: number
    ) {}

    /**
     * После recreate контейнер получает новый ID — ищем актуальный по имени/target.
     */
    private async tryResolveContainerId(): Promise<boolean> {
        try {
            const list = await this.docker.listContainers({ all: true });
            const target = this.displayTarget;
            for (const c of list) {
                if (getContainerDisplayName(c) === target) {
                    this.containerId = c.Id;
                    return true;
                }
                for (const n of c.Names || []) {
                    if (n.replace(/^\//, '') === target) {
                        this.containerId = c.Id;
                        return true;
                    }
                }
            }
        } catch {
            /* ignore */
        }
        return false;
    }

    async check(): Promise<ICheckResult> {
        const timestamp = new Date();
        try {
            let inspect: Docker.ContainerInspectInfo;
            try {
                inspect = await this.docker.getContainer(this.containerId).inspect();
            } catch {
                const resolved = await this.tryResolveContainerId();
                if (!resolved) {
                    return {
                        checkerName: this.name,
                        target: this.displayTarget,
                        isUp: false,
                        status: 'missing',
                        message: 'Контейнер не найден (удалён или недоступен)',
                        timestamp,
                    };
                }
                try {
                    inspect = await this.docker.getContainer(this.containerId).inspect();
                } catch {
                    return {
                        checkerName: this.name,
                        target: this.displayTarget,
                        isUp: false,
                        status: 'missing',
                        message: 'Контейнер не найден после обновления ID',
                        timestamp,
                    };
                }
            }

            const runtimeStatus = formatDockerRuntimeStatus(inspect);

            if (!isContainerUnhealthy(inspect)) {
                this.failureCount = 0;
                return {
                    checkerName: this.name,
                    target: this.displayTarget,
                    isUp: true,
                    status: runtimeStatus,
                    timestamp,
                };
            }

            this.failureCount++;
            const reason = getFailureReason(inspect);
            if (this.failureCount < this.confirmThreshold) {
                return {
                    checkerName: this.name,
                    target: this.displayTarget,
                    isUp: true,
                    status: runtimeStatus,
                    message: `Временный сбой (${this.failureCount}/${this.confirmThreshold}): ${reason}`,
                    timestamp,
                };
            }

            return {
                checkerName: this.name,
                target: this.displayTarget,
                isUp: false,
                status: runtimeStatus,
                message: reason,
                timestamp,
            };
        } catch (error: any) {
            return {
                checkerName: this.name,
                target: this.displayTarget,
                isUp: false,
                status: 'docker_api_error',
                message: `Docker API error: ${error.message}`,
                timestamp,
            };
        }
    }
}

/**
 * Создаёт по чекеру на каждый подходящий контейнер (список снимается при старте приложения).
 */
export async function createDockerContainerCheckers(
    socketPath: string | undefined,
    targets: string[],
    confirmThreshold: number,
    intervalMs: number
): Promise<IChecker[]> {
    const docker = new Docker(socketPath ? { socketPath } : undefined);
    const list = await docker.listContainers({ all: true });

    const wantAll = targets.includes('*');
    const patterns = wantAll ? [] : targets.filter((t) => t !== '*');

    if (!wantAll && patterns.length === 0) {
        return [];
    }

    const picked = new Map<string, { id: string; displayName: string }>();

    if (wantAll) {
        for (const c of list) {
            const displayName = getContainerDisplayName(c);
            picked.set(c.Id, { id: c.Id, displayName });
        }
    } else {
        for (const pattern of patterns) {
            const matches = list.filter((c) => matchesTargetPattern(c, pattern));
            if (matches.length === 0) {
                console.warn(`Docker: нет контейнеров, совпадающих с "${pattern}"`);
            }
            for (const c of matches) {
                const displayName = getContainerDisplayName(c);
                picked.set(c.Id, { id: c.Id, displayName });
            }
        }
    }

    return Array.from(picked.values()).map(
        (p) => new DockerContainerChecker(docker, p.id, p.displayName, confirmThreshold, intervalMs)
    );
}
