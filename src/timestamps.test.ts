import { describe, expect, it } from 'vitest';
import { describeTimestamp, relativeTime, timestampFrom } from './timestamps';

describe('timestampFrom', () => {
  it.each([
    ['UTC', '2026-10-23T09:15:00Z', Date.UTC(2026, 9, 23, 9, 15)],
    ['an offset', '2026-10-27T16:00:00+02:00', Date.UTC(2026, 9, 27, 14, 0)],
    ['milliseconds', '2026-10-23T09:15:00.250Z', Date.UTC(2026, 9, 23, 9, 15, 0, 250)],
  ])('reads ISO dates with a time and %s', (_, text, expected) => {
    expect(timestampFrom(text, 'anything')).toBe(expected);
  });

  it('reads ISO dates with a time in an array, where there is no key', () => {
    expect(timestampFrom('2026-10-23T09:15:00Z', null)).toBe(Date.UTC(2026, 9, 23, 9, 15));
  });

  it.each(['updatedAt', 'created_at', 'startTime', 'end_time', 'dueDate', 'ship_date', 'timestamp', 'ts', 'exp', 'iat', 'nbf', 'time', 'date'])(
    'treats a 10-digit number under %s as Unix seconds',
    (key) => {
      expect(timestampFrom(1792745700, key)).toBe(1792745700_000);
    },
  );

  it('treats a 13-digit number under a time key as milliseconds', () => {
    expect(timestampFrom(1792745700123, 'createdAt')).toBe(1792745700123);
  });

  it.each([
    ['a number under a key that is not a time', 1700000000, 'quantity'],
    ['a number in an array', 1700000000, null],
    ['a short number under a time key', 3600, 'expiresIn'],
    ['a short number under a time-like key', 3600, 'exp'],
    ['a number with a fraction', 1792745700.5, 'updatedAt'],
    ['a date without a time', '2026-10-23', 'date'],
    ['text that only starts like a date', '2026-10-23 is the day', 'note'],
    ['an impossible date', '2026-13-45T99:99:00Z', 'placedAt'],
    ['plain text', 'yesterday', 'updatedAt'],
    ['true', true, 'updatedAt'],
  ])('does not treat %s as a time', (_, value, key) => {
    expect(timestampFrom(value, key)).toBeNull();
  });

  it('only matches keys that end like a time, in their own case', () => {
    expect(timestampFrom(1792745700, 'Attempts')).toBeNull();
    expect(timestampFrom(1792745700, 'format')).toBeNull();
    expect(timestampFrom(1792745700, 'EXP')).toBeNull();
  });
});

describe('relativeTime', () => {
  const NOW = Date.UTC(2026, 9, 25, 12, 0);
  const minutes = (n: number) => NOW + n * 60_000;
  const days = (n: number) => NOW + n * 86_400_000;

  it.each([
    ['the same moment', NOW, 'now'],
    ['30 seconds ago', NOW - 30_000, '30 seconds ago'],
    ['5 minutes ago', minutes(-5), '5 minutes ago'],
    ['3 hours from now', minutes(180), 'in 3 hours'],
    ['1 day ago', days(-1), 'yesterday'],
    ['2 days ago', days(-2), '2 days ago'],
    ['45 days ago', days(-45), 'last month'],
    ['400 days ago', days(-400), 'last year'],
    ['3 years from now', days(3 * 366), 'in 3 years'],
  ])('describes %s', (_, time, expected) => {
    expect(relativeTime(time, NOW)).toBe(expected);
  });
});

describe('describeTimestamp', () => {
  it('gives the local date and time, then how long ago it was', () => {
    const now = Date.UTC(2026, 9, 25, 12, 0);
    const text = describeTimestamp(Date.UTC(2026, 9, 23, 12, 0), now);
    expect(text).toMatch(/2026/);
    expect(text.endsWith(' · 2 days ago')).toBe(true);
  });
});
