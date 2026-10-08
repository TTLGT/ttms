import { OFFICE_TIME_ZONE } from './celebration';

/**
 * Where "today", "this week" and "this month" start, for the person asking.
 *
 * The dashboard's date cards are counted on the server, which on Vercel runs
 * in UTC — so cut on the server's own clock, "today" in Guatemala began at
 * 6pm the evening before. The boundaries are worked out in the caller's time
 * zone instead: the browser names its zone on the request, and the office's
 * (America/Guatemala) stands in when it does not or names one that does not
 * exist. Every office PC is on Guatemala time, so in practice the cards follow
 * the office; somebody working from another zone sees their own midnight.
 *
 * A zone sent by the browser only moves where a window starts. It never
 * widens what anyone may see — visibility is decided before any of this.
 *
 * A per-person setting that overrides the computer's zone would slot in at
 * `browserTimeZone()`; nothing on the server would change.
 *
 * Zone-aware rather than a fixed UTC−6 offset (the attendance code's choice)
 * because a caller's zone may have daylight saving, where a fixed offset would
 * put midnight an hour out for half the year.
 */

/** The zone this browser is set to, or undefined where it will not say. */
export function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** Whether Intl knows the zone. Anything it does not know falls back to the office. */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(value: unknown): string {
  return isTimeZone(value) ? value : OFFICE_TIME_ZONE;
}

/** A zone's wall clock at an instant, as numbers (month 0–11, like Date). */
function wallClock(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get('year'), month: get('month') - 1, day: get('day'),
    hour: get('hour'), minute: get('minute'), second: get('second'),
  };
}

/** How far a zone's wall clock is ahead of UTC at an instant, in ms. */
function offsetAt(instant: number, timeZone: string): number {
  const w = wallClock(instant, timeZone);
  const asUtc = Date.UTC(w.year, w.month, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant a calendar day begins in a zone. Day and month may run over
 * (day 0, day 35) the way Date.UTC allows, which is what makes "the Sunday
 * before" and "seven days on" plain arithmetic.
 *
 * The offset is read twice because the first guess is taken at UTC midnight,
 * which can sit on the other side of a daylight-saving change from the local
 * midnight being looked for.
 */
function midnight(year: number, month: number, day: number, timeZone: string): number {
  const guess = Date.UTC(year, month, day);
  const first = guess - offsetAt(guess, timeZone);
  const second = offsetAt(first, timeZone);
  return guess - second;
}

export interface CalendarBounds {
  dayStart: number;
  /** Sunday 00:00, and the Sunday after it — the week is [weekStart, weekEnd). */
  weekStart: number;
  weekEnd: number;
  monthStart: number;
}

/** Where today, this week (Sunday to Saturday) and this month begin, in a zone. */
export function calendarBounds(now: number, timeZone: string): CalendarBounds {
  const w = wallClock(now, timeZone);
  const weekday = new Date(Date.UTC(w.year, w.month, w.day)).getUTCDay();
  return {
    dayStart:   midnight(w.year, w.month, w.day, timeZone),
    weekStart:  midnight(w.year, w.month, w.day - weekday, timeZone),
    // A midnight of its own rather than start + 7 × 24h: a week that crosses a
    // daylight-saving change is an hour longer or shorter than that.
    weekEnd:    midnight(w.year, w.month, w.day - weekday + 7, timeZone),
    monthStart: midnight(w.year, w.month, 1, timeZone),
  };
}
