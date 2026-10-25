/** Keys whose numbers are times: `createdAt`, `created_at`, `startTime`, `due_date`, … */
const TIME_KEY = /(?:At|_at|Time|_time|Date|_date)$/;
const TIME_KEYS = new Set(['timestamp', 'ts', 'exp', 'iat', 'nbf', 'time', 'date']);
/** `2026-10-23T09:15`: a date with a time. A date alone, such as `2026-10-23`, is not a moment. */
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * The moment a value stands for, in milliseconds since 1970, or `null` when it isn't a time.
 * Strings count when they are ISO dates with a time. Numbers only count when the key looks like a
 * time and they have 10 digits (Unix seconds) or 13 digits (milliseconds), so `quantity: 1700000000`
 * stays a number.
 */
export function timestampFrom(value: unknown, key: string | number | null): number | null {
  if (typeof value === 'string') {
    if (!ISO_DATE_TIME.test(value)) {
      return null;
    }
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : time;
  }
  if (typeof value !== 'number' || typeof key !== 'string' || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  if (!TIME_KEY.test(key) && !TIME_KEYS.has(key)) {
    return null;
  }
  const digits = String(value).length;
  if (digits === 10) {
    return value * 1000;
  }
  return digits === 13 ? value : null;
}

// Each unit's length in seconds, largest first. Months and years are averages.
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365.25 * 86_400],
  ['month', 30.44 * 86_400],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
  ['second', 1],
];

/** "2 days ago", "in 3 hours", "yesterday", "now". In English, like the rest of the viewer. */
export function relativeTime(time: number, now: number = Date.now()): string {
  const seconds = (time - now) / 1000;
  const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  // The largest unit that fits at least once.
  const [unit, size] = UNITS.find(([, length]) => Math.abs(seconds) >= length) ?? ['second', 1];
  return format.format(Math.round(seconds / size), unit);
}

/**
 * "25 Oct 2026, 11:15:00 · 2 days ago". The date and time follow the browser's language and time
 * zone, because that is how people read dates where they live.
 */
export function describeTimestamp(time: number, now: number = Date.now()): string {
  const local = new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
  return `${local} · ${relativeTime(time, now)}`;
}
