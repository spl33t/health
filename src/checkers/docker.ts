import Docker from 'dockerode';
import { IChecker, ICheckResult } from '../types';

interface ContainerInspectState {
    Status?: string;
    Health?: { Status?: string };
}

/**
 * Проверяет, что контейнер в плохом состоянии (unhealthy, restarting, exited).
 */
function isContainerUnhealthy(inspect: { State?: ContainerInspectState; RestartCount?: number }): boolean {
    const status = inspect.State?.Status || '';
    const healthStatus = inspect.State?.Health?.Status;

    // Застрял в перезапусках
    if (status === 'restarting') return true;
    // Упал и не поднялся
    if (status === 'exited') return true;
    // Health check провален
    if (healthStatus === 'unhealthy') return true;

    return false;
}

/**
 * Формирует сообщение о причине сбоя.
 */
function getFailureReason(inspect: { State?: ContainerInspectState; RestartCount?: number }): string {
    const status = inspect.State?.Status || '';
    const healthStatus = inspect.State?.Health?.Status;
    const restartCount = inspect.RestartCount ?? 0;

    if (healthStatus === 'unhealthy') return 'health check failed';
    if (status === 'restarting') return `restart loop (RestartCount: ${restartCount})`;
    if (status === 'exited') return `exited (RestartCount: ${restartCount})`;

    return status;
}

export class DockerChecker implements IChecker {
    private docker: Docker;
    private targets: string[]; // имена контейнеров или '*' для всех
    private confirmThreshold: number;
    /** Счётчик последовательных сбоев по container ID */
    private failureCounts: Map<string, number> = new Map();

    /**
     * @param name название чекера
     * @param socketPath путь к Docker-сокету (undefined — сокет по умолчанию)
     * @param targets имена контейнеров или ['*'] для проверки всех
     * @param confirmThreshold число последовательных сбоев перед отправкой алерта
     * @param intervalMs интервал проверки в миллисекундах
     */
    constructor(
        public name: string,
        socketPath: string | undefined,
        targets: string[],
        confirmThreshold: number,
        public intervalMs: number
    ) {
        this.docker = new Docker(socketPath ? { socketPath } : undefined);
        this.targets = targets;
        this.confirmThreshold = confirmThreshold;
    }

    private getContainerDisplayName(container: { Names?: string[]; Id?: string; Labels?: Record<string, string> }): string {
        const name = container.Names?.[0]?.replace(/^\//, '') || container.Id?.slice(0, 12) || 'unknown';
        const service = container.Labels?.['com.docker.compose.service'];
        return service || name;
    }

    private matchesTarget(container: { Names?: string[]; Id?: string; Labels?: Record<string, string> }): boolean {
        if (this.targets.length === 0) return false;
        if (this.targets.includes('*')) return true;

        const displayName = this.getContainerDisplayName(container);
        const rawName = container.Names?.[0]?.replace(/^\//, '') || '';

        return this.targets.some(
            (t) =>
                displayName === t ||
                displayName.includes(t) ||
                rawName === t ||
                rawName.includes(t)
        );
    }

    async check(): Promise<ICheckResult> {
        const timestamp = new Date();

        try {
            const containers = await this.docker.listContainers({ all: true });
            const relevant = containers.filter((c) => this.matchesTarget(c));

            if (relevant.length === 0) {
                return {
                    target: this.name,
                    isUp: true,
                    message: 'No matching containers found',
                    timestamp,
                };
            }

            const failedContainers: { name: string; reason: string }[] = [];

            for (const c of relevant) {
                const container = this.docker.getContainer(c.Id);
                const inspect = await container.inspect();
                const displayName = this.getContainerDisplayName(c);

                if (isContainerUnhealthy(inspect)) {
                    const count = (this.failureCounts.get(c.Id) || 0) + 1;
                    this.failureCounts.set(c.Id, count);

                    if (count >= this.confirmThreshold) {
                        failedContainers.push({
                            name: displayName,
                            reason: getFailureReason(inspect),
                        });
                    }
                } else {
                    this.failureCounts.delete(c.Id);
                }
            }

            const isUp = failedContainers.length === 0;
            const message =
                failedContainers.length > 0
                    ? failedContainers.map((f) => `${f.name}: ${f.reason}`).join('; ')
                    : undefined;

            return {
                target: this.name,
                isUp,
                status: isUp ? 200 : 500,
                message,
                timestamp,
            };
        } catch (error: any) {
            return {
                target: this.name,
                isUp: false,
                message: `Docker API error: ${error.message}`,
                timestamp,
            };
        }
    }
}
