const moscowFormatter = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
});

/**
 * Дата/время в часовом поясе Москвы; в скобках явно указано, что это Москва.
 */
export function formatTimeMoscow(date: Date): string {
    return `${moscowFormatter.format(date)} (Москва)`;
}

export function formatUptime(seconds: number): string {
    const totalSeconds = Math.max(0, Math.floor(seconds));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(secs).padStart(2, '0');

    if (days > 0) return `${days}d ${hh}:${mm}:${ss}`;
    return `${hh}:${mm}:${ss}`;
}
