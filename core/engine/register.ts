import path from 'path';
import { promises as fs } from 'fs';
import { BaseChecker } from '../checkers/base-checker';
import { BaseAlertProvider } from '../providers/base-provider';
import { MonitorService } from '../services/monitor';
import { ICheckResult } from '../types';
import { withMachineBootEvent, MachineBootEvent } from '../utils/machineBoot';

export class EventToken<TPayload> {
    constructor(public readonly key: string) { }
}

export type PipelineEvent<TPayload = unknown> = {
    type: string;
    at: Date;
    payload: TPayload;
};

type EventHandler<TPayload> = (event: PipelineEvent<TPayload>, ctx: PipelineContext) => Promise<void> | void;

class EventBus {
    private handlersByKey = new Map<string, Set<EventHandler<any>>>();

    on<TPayload>(token: EventToken<TPayload>, handler: EventHandler<TPayload>) {
        const set = this.handlersByKey.get(token.key) ?? new Set<EventHandler<any>>();
        set.add(handler as EventHandler<any>);
        this.handlersByKey.set(token.key, set);
    }

    async emit<TPayload>(token: EventToken<TPayload>, event: PipelineEvent<TPayload>, ctx: PipelineContext) {
        const set = this.handlersByKey.get(token.key);
        if (!set || set.size === 0) return;
        for (const handler of set) {
            try {
                await handler(event, ctx);
            } catch { }
        }
    }
}

type PipelineStateData = Record<string, any>;

class PipelineState {
    public data: PipelineStateData = {};

    constructor(private filePath: string) { }

    async load() {
        try {
            const raw = await fs.readFile(this.filePath, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                this.data = parsed as PipelineStateData;
            }
        } catch {
            this.data = {};
        }
    }

    async save() {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true }).catch(() => { });
        await fs.writeFile(this.filePath, JSON.stringify(this.data), 'utf8').catch(() => { });
    }

    get<T = unknown>(key: string): T | undefined {
        return this.data[key] as T | undefined;
    }

    set(key: string, value: unknown) {
        this.data[key] = value;
    }
}

export type PipelineStateApi = {
    data: PipelineStateData;
    get: <T = unknown>(key: string) => T | undefined;
    set: (key: string, value: unknown) => void;
    save: () => Promise<void>;
};

export type PipelineContext = {
    sendMessage: (message: string, options?: { to?: string[] }) => Promise<void>;
    sendAlert: (result: ICheckResult) => Promise<void>;
    state: PipelineStateApi;
};

export type PipelineDefinition<TPayload = unknown> = {
    id: string;
    enabled?: boolean;
    on: EventToken<TPayload>[];
    run: (event: PipelineEvent<TPayload>, ctx: PipelineContext) => Promise<void> | void;
};

export type RegisterOptions = {
    downReminderIntervalMs?: number;
    stateDir?: string;
};

export type CheckerHandle = {
    name: string;
    checker: BaseChecker;
    events: {
        heartbeat: EventToken<CheckerRunPayload>;
        result: EventToken<CheckerRunPayload>;
        statusChanged: EventToken<CheckerRunPayload>;
        down: EventToken<CheckerRunPayload>;
        up: EventToken<CheckerRunPayload>;
    };
};

export type CheckerRunPayload = {
    uniqueName: string;
    checkerId: string;
    checkerName: string;
    result: ICheckResult;
    previousIsUp: boolean | undefined;
    statusChanged: boolean;
    shouldNotify: boolean;
};

export type ShutdownPayload = {
    signal: string;
};

export function createRegister(options?: RegisterOptions) {
    return new Register(options);
}

export class Register {
    private providersByName = new Map<string, BaseAlertProvider>();
    private checkersByName = new Map<string, BaseChecker>();
    private checkerNameById = new Map<string, string>();
    private checkerEventsByName = new Map<string, CheckerHandle['events']>();
    private bus = new EventBus();
    private pipelines = new Map<string, PipelineDefinition>();
    private started = false;

    public readonly stateDir: string;
    public readonly monitor: MonitorService;

    public readonly events = {
        machine: {
            health_app_first_run: new EventToken<MachineBootEvent>('machine.health_app_first_run'),
            reboot: new EventToken<MachineBootEvent>('machine.reboot'),
        },
        app: {
            shutdown: new EventToken<ShutdownPayload>('app.shutdown'),
        },
    };

    constructor(options?: RegisterOptions) {
        this.stateDir =
            (options?.stateDir ?? path.join(process.cwd(), 'user', 'state')).trim()
            || path.join(process.cwd(), 'user', 'state');
        this.monitor = new MonitorService(options?.downReminderIntervalMs ?? 0);

        this.monitor.onCheckRun = ({ checker, result, previousIsUp, statusChanged, shouldNotify }) => {
            const uniqueName = this.checkerNameById.get(checker.id);
            if (!uniqueName) return;
            const events = this.checkerEventsByName.get(uniqueName);
            if (!events) return;

            const payload: CheckerRunPayload = {
                uniqueName,
                checkerId: checker.id,
                checkerName: checker.name,
                result,
                previousIsUp,
                statusChanged,
                shouldNotify,
            };

            void this.emit(events.heartbeat, payload);
            void this.emit(events.result, payload);

            if (statusChanged) {
                void this.emit(events.statusChanged, payload);
                if (result.isUp) {
                    void this.emit(events.up, payload);
                } else {
                    void this.emit(events.down, payload);
                }
            }
        };
    }

    public provider(uniqueName: string, provider: BaseAlertProvider) {
        if (this.providersByName.has(uniqueName)) {
            throw new Error(`Provider "${uniqueName}" already registered`);
        }
        this.providersByName.set(uniqueName, provider);
        this.monitor.addProvider(provider);
        return provider;
    }

    public checker(uniqueName: string, checker: BaseChecker): CheckerHandle {
        if (this.checkersByName.has(uniqueName)) {
            throw new Error(`Checker "${uniqueName}" already registered`);
        }
        this.checkersByName.set(uniqueName, checker);
        this.checkerNameById.set(checker.id, uniqueName);

        const base = `checker.${uniqueName}`;
        const events: CheckerHandle['events'] = {
            heartbeat: new EventToken<CheckerRunPayload>(`${base}.heartbeat`),
            result: new EventToken<CheckerRunPayload>(`${base}.result`),
            statusChanged: new EventToken<CheckerRunPayload>(`${base}.statusChanged`),
            down: new EventToken<CheckerRunPayload>(`${base}.down`),
            up: new EventToken<CheckerRunPayload>(`${base}.up`),
        };
        this.checkerEventsByName.set(uniqueName, events);

        this.monitor.addChecker(checker);
        return { name: uniqueName, checker, events };
    }

    public pipeline<TPayload>(def: PipelineDefinition<TPayload>) {
        if (this.pipelines.has(def.id)) {
            throw new Error(`Pipeline "${def.id}" already registered`);
        }
        this.pipelines.set(def.id, def as PipelineDefinition);
        const enabled = def.enabled ?? true;
        if (!enabled) return def;

        for (const token of def.on) {
            this.bus.on(token, async (event: PipelineEvent<TPayload>, baseCtx) => {
                const statePath = path.join(this.stateDir, 'pipelines', `${def.id}.json`);
                const state = new PipelineState(statePath);
                await state.load();
                const ctx: PipelineContext = {
                    ...baseCtx,
                    state: {
                        data: state.data,
                        get: (k) => state.get(k),
                        set: (k, v) => state.set(k, v),
                        save: () => state.save(),
                    },
                };
                await def.run(event, ctx);
            });
        }

        return def;
    }

    public async emit<TPayload>(token: EventToken<TPayload>, payload: TPayload) {
        const baseCtx: PipelineContext = {
            sendMessage: async (message, options) => {
                const to = options?.to;
                if (to && to.length > 0) {
                    const selected = to.map((n) => this.providersByName.get(n)).filter(Boolean) as BaseAlertProvider[];
                    await Promise.allSettled(selected.map((p) => p.sendMessage(message)));
                    return;
                }
                await Promise.allSettled(Array.from(this.providersByName.values()).map((p) => p.sendMessage(message)));
            },
            sendAlert: async (result) => {
                await this.monitor.sendAlert(result);
            },
            state: {
                data: {},
                get: () => undefined,
                set: () => { },
                save: async () => { },
            },
        };

        const event: PipelineEvent<TPayload> = { type: token.key, at: new Date(), payload };
        await this.bus.emit(token, event, baseCtx);
    }

    public async start() {
        if (this.started) return;
        this.started = true;

        await withMachineBootEvent({
            stateFilePath: path.join(this.stateDir, 'machine-boot.json'),
            onEvent: async (event) => {
                const token = event.kind === 'reboot'
                    ? this.events.machine.reboot
                    : this.events.machine.health_app_first_run;
                await this.emit(token, event);
            },
        });

        this.monitor.start();
    }

    public async shutdown(signal: string = 'manual') {
        await this.emit(this.events.app.shutdown, { signal });
        this.monitor.stop();
        this.started = false;
    }
}
