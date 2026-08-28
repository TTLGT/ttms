import { DEFAULT_APP_SETTINGS } from '@/types/appSettings';
import type { DateFormat } from '@/types/appSettings';
// The one date validator, kept where the fields that use it are described.
import { isCalendarDate } from '@/types/allowedUser';

/**
 * Every date the app puts on screen is written here.
 *
 * One file because the format is a company-wide setting (Settings →
 * Operations → Date Format). Each page used to carry its own copy of the same
 * four-line formatter, which was harmless until the format became a choice:
 * changing it would have moved some screens and quietly missed others, and a
 * missed screen showing 03/04 next to a changed one showing 04/03 is the exact
 * confusion the setting exists to end.
 *
 * Documents are deliberately **not** formatted here. The BOL, the invoice, the
 * carrier agreement and the public signing page spell the month out — "March
 * 4, 2020" — whatever this setting says. Those leave the company and stand as
 * the record of a shipment, where 03/04/2020 is two different days depending
 * on who is holding the paper.
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Anything the app actually holds a date in: Firestore Timestamp, ISO string, Date. */
export type DateLike = Date | string | { toDate?: () => Date } | null | undefined;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Write out already-split parts. `month` is 1-12.
 *
 * The slash formats pad to two digits so a column of dates lines up and so
 * neither of them can be mistaken for the other's shape; `d-mmm-yyyy` does not,
 * because "06-Apr-2026" reads like a form field and "6-Apr-2026" reads like a
 * date.
 */
function render(year: number, month: number, day: number, format: DateFormat): string {
  if (format === 'mm/dd/yyyy') return `${pad(month)}/${pad(day)}/${year}`;
  if (format === 'dd/mm/yyyy') return `${pad(day)}/${pad(month)}/${year}`;
  return `${day}-${MONTHS[month - 1]}-${year}`;
}

/** Whatever the caller had → a real Date, or null if there is nothing to show. */
function toDate(value: DateLike): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value.toDate === 'function') {
    const d = value.toDate();
    return d instanceof Date && !isNaN(d.getTime()) ? d : null;
  }
  return null;
}

/**
 * Format a plain `YYYY-MM-DD` — a birthday, a start date. Returns '' for
 * anything that is not a real date, which is what the callers test for.
 *
 * The parts are read off the string rather than handed to `new Date(value)`,
 * which parses a bare date as UTC midnight and then renders it in local time —
 * showing every date a day early for anyone in the Americas, this office
 * included.
 */
export function formatCalendarDate(
  value: string | null | undefined,
  format: DateFormat = DEFAULT_APP_SETTINGS.dateFormat,
): string {
  const v = (value ?? '').trim();
  if (!isCalendarDate(v)) return '';

  const [year, month, day] = v.split('-').map(Number);
  return render(year, month, day, format);
}

/**
 * Format a date for display, from a Timestamp, a Date or a string.
 *
 * `fallback` is what to show when there is no date at all — '—' in a table,
 * words in a sentence.
 */
export function formatDate(
  value: DateLike,
  format: DateFormat = DEFAULT_APP_SETTINGS.dateFormat,
  fallback = '—',
): string {
  // A bare YYYY-MM-DD goes the other way round, or it lands a day early — see
  // formatCalendarDate.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return formatCalendarDate(value, format) || fallback;
  }

  const d = toDate(value);
  if (!d) return fallback;
  return render(d.getFullYear(), d.getMonth() + 1, d.getDate(), format);
}

/**
 * Same, with the time after it — for the "who did what, when" lines where the
 * hour is part of the answer.
 */
export function formatDateTime(
  value: DateLike,
  format: DateFormat = DEFAULT_APP_SETTINGS.dateFormat,
  fallback = '—',
): string {
  const d = toDate(value);
  if (!d) return fallback;

  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${render(d.getFullYear(), d.getMonth() + 1, d.getDate(), format)}, ${time}`;
}
