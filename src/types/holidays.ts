/**
 * Public holidays in Guatemala and the United States, for the Celebrations
 * calendar.
 *
 * **Worked out, not stored.** Every holiday here is either a fixed date, an
 * "nth weekday of the month", or tied to Easter — so the list for any year is
 * computed from the rules below, and nobody has to remember to type next
 * year's dates in each January. It costs no reads and cannot go stale.
 *
 * What it cannot do is follow a one-off decree: a holiday declared or moved by
 * the government for a single year will not appear here. If that becomes a
 * need, the answer is a small editable list in Settings beside these rules,
 * not replacing them.
 *
 * Pure, like the rest of src/types — no clock, no Firestore.
 */

export type HolidayCountry = 'GT' | 'US';

export const HOLIDAY_COUNTRY_LABEL: Record<HolidayCountry, string> = {
  GT: 'Guatemala',
  US: 'United States',
};

export interface Holiday {
  /** `YYYY-MM-DD`. */
  date: string;
  country: HolidayCountry;
  name: string;
  /** Anything a person planning around it needs to know — a half day, one city only. */
  note?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** 0 = Sunday … 6 = Saturday, for a calendar date. UTC so no timezone can shift it. */
function weekday(y: number, m: number, d: number): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The nth given weekday of a month — "the 3rd Monday of January". */
function nthWeekday(y: number, m: number, dow: number, n: number): string {
  const first = weekday(y, m, 1);
  return iso(y, m, 1 + ((dow - first + 7) % 7) + (n - 1) * 7);
}

/** The last given weekday of a month — "the last Monday of May". */
function lastWeekday(y: number, m: number, dow: number): string {
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = weekday(y, m, days);
  return iso(y, m, days - ((last - dow + 7) % 7));
}

function shift(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/**
 * Easter Sunday — the anonymous Gregorian algorithm (Meeus/Jones/Butcher).
 * Guatemala's Holy Week holidays hang off it.
 */
export function easterSunday(y: number): string {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(y, month, day);
}

/* ------------------------------------------------------------ Guatemala */

/**
 * Guatemala's national holidays — article 127 of the Código de Trabajo and the
 * decrees that amended it.
 *
 * Holy Thursday is listed as a full day, which is how the law reads, although
 * many employers treat the morning as a working half. Army Day is shown on the
 * 30th of June itself; see its note.
 */
function guatemala(y: number): Holiday[] {
  const easter = easterSunday(y);
  const h = (date: string, name: string, note?: string): Holiday =>
    ({ date, country: 'GT', name, ...(note ? { note } : {}) });

  return [
    h(iso(y, 1, 1),        'New Year’s Day (Año Nuevo)'),
    h(shift(easter, -3),   'Holy Thursday (Jueves Santo)'),
    h(shift(easter, -2),   'Good Friday (Viernes Santo)'),
    h(shift(easter, -1),   'Holy Saturday (Sábado Santo)'),
    h(iso(y, 5, 1),        'Labour Day (Día del Trabajo)'),
    h(iso(y, 6, 30),       'Army Day (Día del Ejército)',
      'The day off can be moved to a Monday by decree. Check with HR which day the office closes.'),
    h(iso(y, 8, 15),       'Assumption Day (Día de la Asunción)', 'Guatemala City only.'),
    h(iso(y, 9, 15),       'Independence Day (Día de la Independencia)'),
    h(iso(y, 10, 20),      'Revolution Day (Día de la Revolución)'),
    h(iso(y, 11, 1),       'All Saints’ Day (Día de Todos los Santos)'),
    h(iso(y, 12, 24),      'Christmas Eve (Nochebuena)', 'Half day, from noon.'),
    h(iso(y, 12, 25),      'Christmas Day (Navidad)'),
    h(iso(y, 12, 31),      'New Year’s Eve (Fin de Año)', 'Half day, from noon.'),
  ];
}

/* ------------------------------------------------------ United States */

/**
 * The eleven US federal holidays (5 U.S.C. 6103).
 *
 * A fixed-date holiday that lands on a weekend is observed on the Friday
 * before (Saturday) or the Monday after (Sunday), and that observed day is
 * listed too, because it is the one the banks and the carriers' offices are
 * closed on. New Year's Day on a Saturday is observed on the 31st of December
 * of the year before, which is why each year also looks at the next one's.
 */
function unitedStates(y: number): Holiday[] {
  const out: Holiday[] = [];
  const h = (date: string, name: string) => out.push({ date, country: 'US', name });
  const fixed = (year: number, m: number, d: number, name: string) => {
    const date = iso(year, m, d);
    if (year === y) h(date, name);
    const dow = weekday(year, m, d);
    const observed = dow === 6 ? shift(date, -1) : dow === 0 ? shift(date, 1) : null;
    if (observed && observed.startsWith(`${y}-`)) {
      out.push({ date: observed, country: 'US', name: `${name} (observed)`, note: 'The federal day off for a holiday that falls on a weekend.' });
    }
  };

  fixed(y, 1, 1, 'New Year’s Day');
  h(nthWeekday(y, 1, 1, 3), 'Martin Luther King Jr. Day');
  h(nthWeekday(y, 2, 1, 3), 'Presidents’ Day');
  h(lastWeekday(y, 5, 1),   'Memorial Day');
  fixed(y, 6, 19, 'Juneteenth');
  fixed(y, 7, 4, 'Independence Day');
  h(nthWeekday(y, 9, 1, 1), 'Labor Day');
  h(nthWeekday(y, 10, 1, 2), 'Columbus Day');
  fixed(y, 11, 11, 'Veterans Day');
  h(nthWeekday(y, 11, 4, 4), 'Thanksgiving Day');
  fixed(y, 12, 25, 'Christmas Day');
  // Next year's New Year's Day, for the one case it is observed in this one.
  fixed(y + 1, 1, 1, 'New Year’s Day');

  return out;
}

/** Every holiday in one year, both countries, in date order. */
export function holidaysInYear(year: number): Holiday[] {
  return [...guatemala(year), ...unitedStates(year)]
    .sort((a, b) => a.date.localeCompare(b.date) || a.country.localeCompare(b.country));
}

/** Every holiday in one month. `month` is 1–12. */
export function holidaysInMonth(year: number, month: number): Holiday[] {
  const prefix = `${year}-${pad(month)}`;
  return holidaysInYear(year).filter((h) => h.date.startsWith(prefix));
}
