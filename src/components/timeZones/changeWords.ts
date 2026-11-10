import { noonOf, otherSideShift } from '@/types/clockChange';
import type { ClockChange } from '@/types/clockChange';

/*
 * What the clock change banner says, in English, with the dictionary key and
 * the values the Spanish line is filled from.
 *
 * Every sentence is a whole template ("US clocks go back one hour on {date}")
 * rather than pieces glued together, so src/lib/i18n/es.ts can hold a proper
 * Spanish sentence for each — word order and verb forms differ, and a
 * sentence assembled from translated fragments reads like one. The date is
 * filled in twice, with the weekday in each language.
 */

export interface Words {
  en: string;
  key: string;
  esVars: Record<string, string>;
}

const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (w, n: string) => v[n] ?? w);

const WEEKDAY_EN = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' });
const WEEKDAY_ES = new Intl.DateTimeFormat('es', { weekday: 'long', timeZone: 'UTC' });

/** "Sunday, 01-Nov-2026" and "domingo 01-Nov-2026" — the date part in the company's format. */
export function dayLabels(day: string, formatCalendarDate: (v: string) => string): { en: string; es: string } {
  const ms = noonOf(day);
  const date = formatCalendarDate(day);
  return { en: `${WEEKDAY_EN.format(ms)}, ${date}`, es: `${WEEKDAY_ES.format(ms)} ${date}` };
}

/** The banner's title. `days` is from today to the change: positive ahead, negative past. */
export function headline(
  change: ClockChange,
  place: string,
  days: number,
  day: { en: string; es: string },
): Words {
  const mover = change.us ?? change.local!;
  const subject = change.us && change.local ? 'Clocks in the US and {place}' : change.us ? 'US clocks' : 'Clocks in {place}';
  const dir = mover.forward ? 'forward' : 'back';
  const verb = days > 0 ? `go ${dir} one hour on {date}` : days === 0 ? `went ${dir} one hour today` : `went ${dir} one hour on {date}`;
  const key = `${subject} ${verb}`;
  return { key, en: fill(key, { place, date: day.en }), esVars: { place, date: day.es } };
}

/**
 * The sentence under the title: what the other side is doing, which is the
 * whole story for somebody in the UK, where the two countries change a week
 * or three apart.
 */
export function context(
  change: ClockChange,
  tz: string,
  place: string,
  days: number,
  formatCalendarDate: (v: string) => string,
): Words | null {
  if (change.us && change.local) return null;
  const side = change.us ? 'local' : 'us';
  const other = otherSideShift(tz, change, side);
  let key: string;
  if (!other) {
    key = change.us
      ? (days > 0
        ? 'Clocks in {place} do not change, so your time difference with the US will change by one hour.'
        : 'Clocks in {place} do not change, so your time difference with the US has changed by one hour.')
      : 'US clocks do not change, so your time difference with the US changes by one hour.';
  } else if (other.date < change.date) {
    key = change.us
      ? 'Clocks in {place} already changed on {other}, so this puts your gap with the US back to normal.'
      : 'US clocks already changed on {other}, so this puts your gap with the US back to normal.';
  } else {
    key = change.us
      ? 'Clocks in {place} do not change until {other}, so for a while your gap with the US is one hour off.'
      : 'US clocks do not change until {other}, so until then your gap with the US is one hour off.';
  }
  const o = other ? dayLabels(other.date, formatCalendarDate) : { en: '', es: '' };
  return { key, en: fill(key, { place, other: o.en }), esVars: { place, other: o.es } };
}

export function checkLine(days: number): string {
  return days > 0
    ? 'Check pickup and delivery appointments and call times booked for after that day.'
    : 'Check pickup and delivery appointments and call times.';
}
