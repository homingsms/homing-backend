export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function toIso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

export function toUtcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
