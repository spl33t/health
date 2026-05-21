import express, { Request, Response } from 'express';
import http from 'http';
import { BaseChecker } from './checkers/base-checker';
import { BaseAlertProvider } from './providers/base-provider';
import {
    EventToken,
    PipelineContext,
    PipelineDefinition,
    PipelineEvent,
    RegisterOptions,
    createRegister,
} from './engine/register';
import { ICheckResult } from './types';

export type { EventToken, PipelineContext, PipelineDefinition, PipelineEvent, RegisterOptions };

export type HealthOptions = RegisterOptions & {
    port?: number;
    enableHttp?: boolean;
    providers?: ProviderState[];
    checkers?: CheckerState[];
    pipelines?: PipelineState[];
};

export type Base<TStatus extends string, TExtra extends Record<string, any> = {}> = {
    uniqueName: string;
    status: TStatus;
} & TExtra;

export type Active<TExtra extends Record<string, any> = {}> = Base<'active', TExtra>;

export type Failed<TExtra extends Record<string, any> = {}> = Base<
    'failed',
    TExtra & {
        reason?: string;
    }
>;

export function isActive<TExtra extends Record<string, any>>(
    state: Active<TExtra> | Failed<any>
): state is Active<TExtra> {
    return state.status === 'active';
}

export type HealthEvents = {
    machine: {
        health_app_first_run: EventToken<any>;
        reboot: EventToken<any>;
    };
    app: {
        shutdown: EventToken<{ signal: string }>;
    };
};

export const healthEvents: HealthEvents = {
    machine: {
        health_app_first_run: new EventToken<any>('machine.health_app_first_run'),
        reboot: new EventToken<any>('machine.reboot'),
    },
    app: {
        shutdown: new EventToken<{ signal: string }>('app.shutdown'),
    },
};

export type CheckerEvents = {
    heartbeat: EventToken<any>;
    result: EventToken<any>;
    statusChanged: EventToken<any>;
    down: EventToken<any>;
    up: EventToken<any>;
};

export function checkerEvents(uniqueName: string): CheckerEvents {
    const base = `checker.${uniqueName}`;
    return {
        heartbeat: new EventToken<any>(`${base}.heartbeat`),
        result: new EventToken<any>(`${base}.result`),
        statusChanged: new EventToken<any>(`${base}.statusChanged`),
        down: new EventToken<any>(`${base}.down`),
        up: new EventToken<any>(`${base}.up`),
    };
}

export type ProviderState =
    | Active<{ provider: BaseAlertProvider }>
    | Failed;

export type CheckerState =
    | Active<{ checker: BaseChecker; events: CheckerEvents }>
    | Failed<{ events: CheckerEvents }>;

export type PipelineState =
    | Active<{ pipeline: PipelineDefinition<any> }>
    | Failed;

function formatReason(err: unknown): string | undefined {
    if (!err) return undefined;
    if (typeof err === 'string') return err;
    if (err instanceof Error) return err.message || String(err);
    try {
        return JSON.stringify(err);
    } catch {
        return String(err);
    }
}

export function defineProvider(args: {
    uniqueName: string;
    provider?: BaseAlertProvider;
    reason?: string;
}): ProviderState {
    const name = args.uniqueName.trim() || args.uniqueName;
    try {
        const provider = args.provider;
        if (!provider) {
            return { uniqueName: name, status: 'failed', reason: args.reason ?? 'provider is undefined' };
        }
        return { uniqueName: name, status: 'active', provider };
    } catch (err) {
        return { uniqueName: name, status: 'failed', reason: args.reason ?? formatReason(err) };
    }
}

export function defineChecker(args: {
    uniqueName: string;
    checker?: BaseChecker;
    reason?: string;
}): CheckerState {
    const name = args.uniqueName.trim() || args.uniqueName;
    const events = checkerEvents(name);
    try {
        const checker = args.checker;
        if (!checker) {
            return { uniqueName: name, status: 'failed', events, reason: args.reason ?? 'checker is undefined' };
        }
        return { uniqueName: name, status: 'active', checker, events };
    } catch (err) {
        return { uniqueName: name, status: 'failed', events, reason: args.reason ?? formatReason(err) };
    }
}

export function definePipeline<TPayload = unknown>(args: {
    uniqueName: string;
    enabled?: boolean;
    on: EventToken<TPayload>[];
    run: (event: PipelineEvent<TPayload>, ctx: PipelineContext) => Promise<void> | void;
    reason?: string;
}): PipelineState {
    const uniqueName = args.uniqueName.trim() || args.uniqueName;
    try {
        if (!uniqueName) {
            return { uniqueName: 'pipeline.unknown', status: 'failed', reason: args.reason ?? 'uniqueName is empty' };
        }
        if (!Array.isArray(args.on) || args.on.length === 0) {
            return { uniqueName, status: 'failed', reason: args.reason ?? 'pipeline.on is empty' };
        }
        if (typeof args.run !== 'function') {
            return { uniqueName, status: 'failed', reason: args.reason ?? 'pipeline.run is not a function' };
        }

        const pipeline: PipelineDefinition<any> = {
            id: uniqueName,
            enabled: args.enabled,
            on: args.on as EventToken<any>[],
            run: args.run as any,
        };

        return { uniqueName, status: 'active', pipeline };
    } catch (err) {
        return { uniqueName, status: 'failed', reason: args.reason ?? formatReason(err) };
    }
}

export class Health {
    private register: ReturnType<typeof createRegister>;
    private app: ReturnType<typeof express> | undefined;
    private server: http.Server | undefined;
    private options: HealthOptions;
    private registered = false;

    constructor(options?: HealthOptions) {
        this.options = options ?? {};
        this.register = createRegister(this.options);
    }

    private registerAll() {
        if (this.registered) return;
        this.registered = true;

        for (const p of this.options.providers ?? []) {
            if (p.status === 'failed') {
                console.warn(`WARNING provider "${p.uniqueName}" failed${p.reason ? `: ${p.reason}` : ''}`);
                continue;
            }
            try {
                this.register.provider(p.uniqueName, p.provider);
            } catch (err) {
                console.warn(`WARNING provider "${p.uniqueName}" failed${formatReason(err) ? `: ${formatReason(err)}` : ''}`);
            }
        }

        for (const c of this.options.checkers ?? []) {
            if (c.status === 'failed') {
                console.warn(`WARNING checker "${c.uniqueName}" failed${c.reason ? `: ${c.reason}` : ''}`);
                continue;
            }
            try {
                this.register.checker(c.uniqueName, c.checker);
            } catch (err) {
                console.warn(`WARNING checker "${c.uniqueName}" failed${formatReason(err) ? `: ${formatReason(err)}` : ''}`);
            }
        }

        for (const p of this.options.pipelines ?? []) {
            if (p.status === 'failed') {
                console.warn(`WARNING pipeline "${p.uniqueName}" failed${p.reason ? `: ${p.reason}` : ''}`);
                continue;
            }
            try {
                this.register.pipeline(p.pipeline);
            } catch (err) {
                console.warn(`WARNING pipeline "${p.uniqueName}" failed${formatReason(err) ? `: ${formatReason(err)}` : ''}`);
            }
        }
    }

    public async start() {
        this.registerAll();

        const enableHttp = this.options.enableHttp ?? true;
        if (enableHttp) {
            if (!this.app) {
                this.app = express();
                this.app.get('/status', (req: Request, res: Response) => {
                    res.json({
                        status: 'ok',
                        monitoring: this.getStatus(),
                    });
                });

                this.app.get('/mock-target', (req: Request, res: Response) => {
                    res.status(200).send('Mock Service UP');
                });
            }

            if (!this.server) {
                const envPortRaw = process.env.PORT;
                const envPort = typeof envPortRaw === 'string' ? parseInt(envPortRaw, 10) : NaN;
                const port = this.options.port ?? (Number.isFinite(envPort) ? envPort : 3000);
                this.server = this.app.listen(port);
            }
        }
        await this.register.start();
    }

    public async shutdown(signal: string = 'manual') {
        await this.register.shutdown(signal);
        if (this.server) {
            const srv = this.server;
            this.server = undefined;
            await new Promise<void>((resolve) => srv.close(() => resolve()));
        }
    }

    public getStatus() {
        return this.register.monitor.getStatus();
    }

    public getCheckers() {
        return this.register.monitor.getCheckers();
    }

    public async sendAlert(result: ICheckResult) {
        await this.register.monitor.sendAlert(result);
    }

    public get events() {
        return this.register.events;
    }

    public get eventTokens() {
        return healthEvents;
    }

    public get httpApp() {
        return this.app;
    }

    public get httpServer() {
        return this.server;
    }
}

export function createHealth(options?: HealthOptions) {
    return new Health(options);
}
