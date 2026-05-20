export function hoursToMs(hours: any, defaultHours: any = 0): number {
    const parsedHours =
        typeof hours === 'number'
            ? hours
            : typeof hours === 'string'
                ? parseFloat(hours.trim())
                : NaN;

    const parsedDefault =
        typeof defaultHours === 'number'
            ? defaultHours
            : typeof defaultHours === 'string'
                ? parseFloat(defaultHours.trim())
                : NaN;

    const effective = Number.isFinite(parsedHours) ? parsedHours : parsedDefault;
    if (!Number.isFinite(effective) || effective <= 0) return 0;
    return Math.round(effective * 3600000);
}

export function minutesToMs(minutes: any, defaultMinutes: any = 0): number {
    const parsedMinutes =
        typeof minutes === 'number'
            ? minutes
            : typeof minutes === 'string'
                ? parseFloat(minutes.trim())
                : NaN;

    const parsedDefault =
        typeof defaultMinutes === 'number'
            ? defaultMinutes
            : typeof defaultMinutes === 'string'
                ? parseFloat(defaultMinutes.trim())
                : NaN;

    const effective = Number.isFinite(parsedMinutes) ? parsedMinutes : parsedDefault;
    if (!Number.isFinite(effective) || effective <= 0) return 0;
    return Math.round(effective * 60000);
}
