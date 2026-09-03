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
/**
 * Everything a date reaches this file as.
 *
 * The last shape is the one that is easy to miss: a Firestore Timestamp that
 * has been through JSON on its way out of an API route arrives as
 * `{_seconds, _nanoseconds}` with no methods on it. It looks like a Timestamp
 * in the types and behaves like nothing at all, so every date rendered from an
 * API response silently fell back to the em dash. Handled in toDate() below.
 */
export type DateLike =
  | Date
  | string
  | { toDate?: () => Date }
  | { _seconds: number; _nanoseconds?: number }
  | { seconds: number; nanoseconds?: number }
  | null
  | undefined;

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

/**
 * Whatever the caller had → a real Date, or null if there is nothing to show.
 *
 * Exported because the `{_seconds}` shape an API response arrives in is not
 * only a display problem: written straight back to Firestore it saves as a map
 * rather than a timestamp. A form that loads a date and saves it again has to
 * come through here first.
 */
export function toDate(value: DateLike): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if ('toDate' in value && typeof value.toDate === 'function') {
    const d = value.toDate();
    return d instanceof Date && !isNaN(d.getTime()) ? d : null;
  }
  // A Timestamp that came back over JSON. The Admin SDK serializes to
  // `_seconds`; some paths produce the unprefixed form, so both are read.
  const secs =
    '_seconds' in value && typeof value._seconds === 'number' ? value._seconds
    : 'seconds' in value && typeof value.seconds === 'number' ? value.seconds
    : null;
  if (secs !== null) {
    const d = new Date(secs * 1000);
    return isNaN(d.getTime()) ? null : d;
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

// ── Reading a date somebody typed ─────────────────────────────────────────────

const MONTH_NUMBERS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export type ParsedDateInput =
  | { ok: true; iso: string }
  | { ok: false; reason: 'empty' | 'unreadable' | 'ambiguous' };

/**
 * Read what someone typed into a date box.
 *
 * `format` settles the one question a typed date cannot answer for itself:
 * whether "3/4/2020" is the 4th of March or the 3rd of April. Under either
 * slash setting the company has already said which, so it is taken at its
 * word. Under `d-mmm-yyyy` nobody has said, so a numeric date is accepted only
 * where it cannot be read two ways — 25/11 has no second reading, 3/4 does,
 * and guessing at that one would write a wrong birthday that looks perfectly
 * fine on screen.
 *
 * Two-digit years are refused outright, as they are in the spreadsheet
 * importer: '55' is 1955 for a birthday and 2055 for nothing at all.
 */
export function parseDateInput(text: string, format: DateFormat): ParsedDateInput {
  const value = (text ?? '').trim();
  if (!value) return { ok: false, reason: 'empty' };

  const bad = (reason: 'unreadable' | 'ambiguous') => ({ ok: false as const, reason });
  const built = (y: number, m: number, d: number): ParsedDateInput => {
    const iso = `${y}-${pad(m)}-${pad(d)}`;
    // Catches the 31st of February and anything else shaped right but not real.
    return isCalendarDate(iso) ? { ok: true, iso } : bad('unreadable');
  };

  // What a date box holds internally, and what the calendar button produces.
  const iso = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) return built(+iso[1], +iso[2], +iso[3]);

  // "4-Mar-2020", "4 Mar 2020", "4/March/2020"
  const dayFirst = value.match(/^(\d{1,2})[\s\-/.]\s*([a-z]{3,9})\.?,?[\s\-/.]\s*(\d{4})$/i);
  if (dayFirst) {
    const month = MONTH_NUMBERS[dayFirst[2].slice(0, 3).toLowerCase()];
    return month ? built(+dayFirst[3], month, +dayFirst[1]) : bad('unreadable');
  }

  // "Mar 4, 2020", "March 4 2020"
  const monthFirst = value.match(/^([a-z]{3,9})\.?[\s\-/.]\s*(\d{1,2}),?[\s\-/.]\s*(\d{4})$/i);
  if (monthFirst) {
    const month = MONTH_NUMBERS[monthFirst[1].slice(0, 3).toLowerCase()];
    return month ? built(+monthFirst[3], month, +monthFirst[2]) : bad('unreadable');
  }

  const numeric = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (numeric) {
    const first = +numeric[1];
    const second = +numeric[2];
    const year = +numeric[3];

    if (format === 'mm/dd/yyyy') return first > 12 ? bad('unreadable') : built(year, first, second);
    if (format === 'dd/mm/yyyy') return second > 12 ? bad('unreadable') : built(year, second, first);

    // No stated order. Take it only where there is one possible reading.
    if (first > 12 && second <= 12) return built(year, second, first);
    if (second > 12 && first <= 12) return built(year, first, second);
    return bad('ambiguous');
  }

  return bad('unreadable');
}

/** An example in the company's format, for placeholders and error messages. */
export function dateInputExample(format: DateFormat): string {
  return formatCalendarDate('2020-03-04', format);
}
