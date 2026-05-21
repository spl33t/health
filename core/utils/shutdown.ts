/**
 * Регистрирует обработчики завершения процесса (SIGINT/SIGTERM) и даёт удобную точку расширения
 * через callback.
 *
 * Особенности:
 * - защищает от повторного выполнения (shutdown выполнится один раз)
 * - ограничивает время выполнения callback через timeout
 * - завершает процесс с заданным exitCode
 */
export function registerShutdownHandler(args: {
    /**
     * Callback, который будет вызван при завершении процесса.
     * Сюда обычно помещают “последнее уведомление”, graceful shutdown и т.п.
     */
    onShutdown: (signal: string) => Promise<void> | void;
    /**
     * Сколько миллисекунд ждать выполнения `onShutdown`, прежде чем принудительно выйти.
     * По умолчанию: 5000.
     */
    timeoutMs?: number;
    /**
     * Exit code, с которым завершить процесс после обработки shutdown.
     * По умолчанию: 0.
     */
    exitCode?: number;
}): void {
    const timeoutMs = args.timeoutMs ?? 5000;
    const exitCode = args.exitCode ?? 0;

    let isShuttingDown = false;

    async function shutdown(signal: string) {
        if (isShuttingDown) return;
        isShuttingDown = true;
        console.log(`Получен ${signal}, завершение...`);
        try {
            await Promise.race([
                Promise.resolve(args.onShutdown(signal)),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
            ]);
        } catch (e) { }
        process.exit(exitCode);
    }

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}
