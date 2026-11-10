/*
 * Clock changes and US time zones — the rules behind the dashboard's clock
 * change banner and its permanent "US time zones" section.
 *
 * Pure: no Firestore, no React, no stored data. **Every date here comes from
 * the browser's own time zone database** (`Intl`), asked "what is New York's
 * offset on this day?" one day at a time. Nothing is hard-coded about the
 * second Sunday of March or the first Sunday of November, so when a country
 * changes its rules — Mexico dropped daylight saving in 2022, and the US has
 * a bill to do the same — the browser's next update carries the change and
 * this code needs none. No API, no cron, no read.
 *
 * Whose clock: the person's own (src/lib/useMyTimeZone.ts) — a city they
 * picked on My profile, else their computer's zone. Guatemala does not change
 * its clocks, Chiapas neither (Mexico City time, no daylight saving since
 * 2022), the UK does on different Sundays from the US; all three fall out of
 * the same arithmetic.
 *
 * Every gap is measured *from the viewer*: "Eastern, 1 h ahead" means one hour
 * ahead of the person reading it, not of the office.
 */

/** The office's zone. Fixed at UTC−6 all year — see OFFICE_UTC_OFFSET_MINUTES. */
export const OFFICE_TIME_ZONE = 'America/Guatemala';

/** How many days either side of a change the banner shows. */
export const BANNER_DAYS = 7;

export type ZoneId = 'et' | 'ct' | 'mt' | 'pt' | 'az' | 'ak' | 'hi' | 'office';

export interface ZoneDef {
  id: ZoneId;
  tz: string;
  name: string;
  /** Spanish name, shown under the English with the switch on. */
  es: string;
  where: string;
}

export const US_ZONES: ZoneDef[] = [
  { id: 'et', tz: 'America/New_York',    name: 'Eastern',  es: 'Este',     where: 'New York, Atlanta, Miami' },
  { id: 'ct', tz: 'America/Chicago',     name: 'Central',  es: 'Centro',   where: 'Chicago, Dallas, Houston' },
  { id: 'mt', tz: 'America/Denver',      name: 'Mountain', es: 'Montaña',  where: 'Denver, Salt Lake City' },
  { id: 'pt', tz: 'America/Los_Angeles', name: 'Pacific',  es: 'Pacífico', where: 'Los Angeles, Seattle' },
  { id: 'az', tz: 'America/Phoenix',     name: 'Arizona',  es: 'Arizona',  where: 'Phoenix · never changes' },
  { id: 'ak', tz: 'America/Anchorage',   name: 'Alaska',   es: 'Alaska',   where: 'Anchorage' },
  { id: 'hi', tz: 'Pacific/Honolulu',    name: 'Hawaii',   es: 'Hawái',    where: 'Honolulu · never changes' },
];

/** Shown beside the US zones for anybody whose own clock is not the office's. */
export const OFFICE_ZONE: ZoneDef = {
  id: 'office', tz: OFFICE_TIME_ZONE, name: 'TTL office', es: 'Oficina TTL', where: 'Guatemala · colleagues and shifts',
};

/** The zone that is "the US" for deciding when US clocks change. */
const US_REFERENCE = 'America/New_York';

/**
 * Which zone each state is drawn in on the map. A few states straddle two
 * zones (the Florida panhandle, El Paso, East Tennessee, western Kentucky,
 * the Idaho panhandle and others); each is filled by the zone that covers
 * most of it, and the map says so in a note under it.
 */
export const ZONE_STATES: Record<Exclude<ZoneId, 'office'>, string[]> = {
  et: ['Connecticut', 'Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Indiana', 'Kentucky', 'Maine', 'Maryland',
       'Massachusetts', 'Michigan', 'New Hampshire', 'New Jersey', 'New York', 'North Carolina', 'Ohio', 'Pennsylvania',
       'Rhode Island', 'South Carolina', 'Vermont', 'Virginia', 'West Virginia'],
  ct: ['Alabama', 'Arkansas', 'Illinois', 'Iowa', 'Kansas', 'Louisiana', 'Minnesota', 'Mississippi', 'Missouri', 'Nebraska',
       'North Dakota', 'Oklahoma', 'South Dakota', 'Tennessee', 'Texas', 'Wisconsin'],
  mt: ['Colorado', 'Idaho', 'Montana', 'New Mexico', 'Utah', 'Wyoming'],
  pt: ['California', 'Nevada', 'Oregon', 'Washington'],
  az: ['Arizona'],
  ak: ['Alaska'],
  hi: ['Hawaii'],
};

export const ZONE_OF_STATE: Record<string, ZoneId> = Object.fromEntries(
  Object.entries(ZONE_STATES).flatMap(([zone, states]) => states.map((s) => [s, zone as ZoneId])),
);

// ── Offsets ──────────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

/** Minutes east of UTC for `tz` at instant `ms` — −360 for Guatemala, 60 for London in summer. */
export function offsetMinutes(tz: string, ms: number): number {
  let f = offsetFormatters.get(tz);
  if (!f) {
    // `shortOffset` gives "GMT-4" / "GMT+5:30" / "GMT", which is all we need.
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' } as Intl.DateTimeFormatOptions);
    offsetFormatters.set(tz, f);
  }
  const part = f.formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d+)(?::(\d+))?/.exec(part);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
}

/** True for a zone name this browser (or server) knows, like "Europe/London". */
export function isTimeZoneName(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false;
  if (!/^[A-Za-z]+(?:\/[A-Za-z0-9_+\-]+)*$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The computer's own zone, or the office's when the browser will not say. */
export function detectTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isTimeZoneName(tz) ? tz : OFFICE_TIME_ZONE;
  } catch {
    return OFFICE_TIME_ZONE;
  }
}

/** "Europe/London" → "London". What a zone is called when nobody picked a city. */
export function cityOfZone(tz: string): string {
  return (tz.split('/').pop() ?? tz).replace(/_/g, ' ');
}

// ── Days ─────────────────────────────────────────────────────────────────────

/** Noon UTC on a `YYYY-MM-DD` — far enough from midnight that no zone's date differs. */
export const noonOf = (day: string) => Date.parse(`${day}T12:00:00Z`);
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Today's date as `YYYY-MM-DD` on the clock in `tz`. */
export function todayIn(tz: string, now = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(now));
}

/** Whole days from `from` to `to` — negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((noonOf(to) - noonOf(from)) / DAY);
}

export function addDays(day: string, n: number): string {
  return isoDay(noonOf(day) + n * DAY);
}

// ── Changes ──────────────────────────────────────────────────────────────────

/** One zone moving its clocks: the Sunday, which way, and the offsets either side. */
export interface Shift {
  date: string;
  forward: boolean;
  before: number;
  after: number;
}

/**
 * A day on which this person's gap with the US moves: the US changing, their
 * own clock changing, or (in principle) both.
 */
export interface ClockChange {
  date: string;
  us: Shift | null;
  local: Shift | null;
}

const shiftCache = new Map<string, Shift[]>();

/**
 * Every change `tz` makes in `year`, found by comparing each day's offset at
 * noon UTC with the day before. US clocks move at 2am local and Europe's at
 * 1am UTC, both before noon UTC, so the change lands on its own Sunday.
 * 365 lookups, cached per zone and year.
 */
export function shiftsIn(tz: string, year: number): Shift[] {
  const key = `${tz}|${year}`;
  const hit = shiftCache.get(key);
  if (hit) return hit;
  const out: Shift[] = [];
  let prev = offsetMinutes(tz, Date.UTC(year, 0, 1, 12));
  for (let i = 1; i < 366; i++) {
    const ms = Date.UTC(year, 0, 1 + i, 12);
    if (new Date(ms).getUTCFullYear() !== year) break;
    const now = offsetMinutes(tz, ms);
    if (now !== prev) out.push({ date: isoDay(ms), forward: now > prev, before: prev, after: now });
    prev = now;
  }
  shiftCache.set(key, out);
  return out;
}

function shiftsAround(tz: string, today: string): Shift[] {
  const y = Number(today.slice(0, 4));
  return [...shiftsIn(tz, y - 1), ...shiftsIn(tz, y), ...shiftsIn(tz, y + 1)];
}

/** The US's changes and the viewer's own, merged by day, oldest first. */
export function changesFor(viewerTz: string, today: string): ClockChange[] {
  const byDay = new Map<string, ClockChange>();
  for (const s of shiftsAround(US_REFERENCE, today)) byDay.set(s.date, { date: s.date, us: s, local: null });
  if (viewerTz !== US_REFERENCE) {
    for (const s of shiftsAround(viewerTz, today)) {
      const c = byDay.get(s.date) ?? { date: s.date, us: null, local: null };
      c.local = s;
      byDay.set(s.date, c);
    }
  }
  return [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * The change the banner is about today, or null. Within BANNER_DAYS either
 * side; one still coming (or today) wins over one that has passed, which is
 * what a UK reader needs in the week between the UK's change and the US's.
 *
 * `closedThrough` is the date of the last change this person closed — that
 * one and anything before it stay hidden.
 */
export function bannerChange(viewerTz: string, today: string, closedThrough = ''): ClockChange | null {
  const near = changesFor(viewerTz, today)
    .filter((c) => Math.abs(daysBetween(c.date, today)) <= BANNER_DAYS && c.date > closedThrough);
  const coming = near.filter((c) => c.date >= today);
  if (coming.length) return coming[0];
  return near.length ? near[near.length - 1] : null;
}

/** Any change near today, closed or not — for the permanent section's before/after. */
export function nearChange(viewerTz: string, today: string): ClockChange | null {
  return bannerChange(viewerTz, today, '');
}

/** The next change after today, for "next change: …" on the permanent section. */
export function nextChange(viewerTz: string, today: string): ClockChange | null {
  return changesFor(viewerTz, today).find((c) => c.date > today) ?? null;
}

/**
 * The other side's nearest change within a month — to say "US clocks do not
 * change until …" on the UK's Sunday, or "already changed on …".
 */
export function otherSideShift(tz: string, change: ClockChange, side: 'us' | 'local'): Shift | null {
  const zone = side === 'us' ? US_REFERENCE : tz;
  const d = noonOf(change.date);
  return shiftsAround(zone, change.date)
    .filter((s) => s.date !== change.date && Math.abs(noonOf(s.date) - d) <= 31 * DAY)
    .sort((a, b) => Math.abs(noonOf(a.date) - d) - Math.abs(noonOf(b.date) - d))[0] ?? null;
}

/**
 * The local hour the clock jumps at, for the turning clock on the banner:
 * 2am in the US; in Europe 1am UTC, which is 1am in London and 2am in Madrid.
 */
export function jumpHours(shift: Shift, tz: string): [number, number] {
  const from = tz.startsWith('Europe/') ? 1 + shift.before / 60 : 2;
  return [from, from + (shift.forward ? 1 : -1)];
}

// ── Gaps ─────────────────────────────────────────────────────────────────────

/** One zone's gap with the viewer, in minutes ahead (+) or behind (−), before and after. */
export interface ZoneGap extends ZoneDef {
  before: number;
  after: number;
  moved: boolean;
}

/**
 * Each US zone's gap with the viewer — either side of `change`, or right now
 * when there is none. The office is added for anybody not on office time.
 */
export function zoneGaps(viewerTz: string, change: ClockChange | null, now = Date.now()): ZoneGap[] {
  const beforeMs = change ? noonOf(change.date) - 2 * DAY : now;
  const afterMs = change ? noonOf(change.date) + DAY : now;
  const zones = viewerTz === OFFICE_TIME_ZONE ? US_ZONES : [...US_ZONES, OFFICE_ZONE];
  return zones.map((z) => {
    const before = offsetMinutes(z.tz, beforeMs) - offsetMinutes(viewerTz, beforeMs);
    const after = offsetMinutes(z.tz, afterMs) - offsetMinutes(viewerTz, afterMs);
    return { ...z, before, after, moved: before !== after };
  });
}

/** "1 h ahead", "same time", "2 h behind", "5.5 h ahead". */
export function gapText(min: number): string {
  if (min === 0) return 'same time';
  const h = Math.abs(min) / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h ${min > 0 ? 'ahead' : 'behind'}`;
}

/** The same in Spanish, for the line under it. */
export function gapTextEs(min: number): string {
  if (min === 0) return 'misma hora';
  const h = Math.abs(min) / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h ${min > 0 ? 'adelante' : 'atrás'}`;
}

/** Hours since midnight (any number, even negative or past 24) as "7:30 am". */
export function clockText(hours: number): string {
  const t = ((hours % 24) + 24) % 24;
  let h = Math.floor(t + 1e-9);
  let m = Math.round((t - h) * 60);
  if (m === 60) { h = (h + 1) % 24; m = 0; }
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** −1, 0 or +1: whether a converted time fell on the day before or after. */
export const dayShift = (hours: number) => Math.floor(hours / 24);

/** "Today", "Tomorrow", "In 3 days", "Yesterday", "4 days ago". `days` is change − today. */
export function relativeDays(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return days > 0 ? `In ${days} days` : `${-days} days ago`;
}

// ── Cities for the setting ───────────────────────────────────────────────────

/**
 * Cities people here are likely to type, offered ahead of the whole world
 * list. Chiapas has no zone of its own in the database — its towns are on
 * Mexico City time — so they are listed by name here, or nobody would find
 * them.
 */
export const SUGGESTED_CITIES: Array<{ city: string; label: string; tz: string }> = [
  { city: 'Guatemala City',            label: 'Guatemala City, Guatemala',                   tz: 'America/Guatemala' },
  { city: 'Quetzaltenango',            label: 'Quetzaltenango, Guatemala',                   tz: 'America/Guatemala' },
  { city: 'Antigua Guatemala',         label: 'Antigua Guatemala, Guatemala',                tz: 'America/Guatemala' },
  { city: 'Tuxtla Gutiérrez',          label: 'Tuxtla Gutiérrez, Chiapas, Mexico',           tz: 'America/Mexico_City' },
  { city: 'Tapachula',                 label: 'Tapachula, Chiapas, Mexico',                  tz: 'America/Mexico_City' },
  { city: 'San Cristóbal de las Casas', label: 'San Cristóbal de las Casas, Chiapas, Mexico', tz: 'America/Mexico_City' },
  { city: 'London',                    label: 'London, United Kingdom',                      tz: 'Europe/London' },
  { city: 'Manchester',                label: 'Manchester, United Kingdom',                  tz: 'Europe/London' },
  { city: 'Birmingham',                label: 'Birmingham, United Kingdom',                  tz: 'Europe/London' },
];

/** Every zone this browser knows, as "London (Europe/London)", after the suggestions. */
export function allCityOptions(): Array<{ city: string; label: string; tz: string }> {
  const seen = new Set(SUGGESTED_CITIES.map((c) => c.label));
  const out = [...SUGGESTED_CITIES];
  let zones: string[] = [];
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    zones = fn ? fn('timeZone') : [];
  } catch { /* an old browser: the suggestions alone */ }
  for (const tz of zones) {
    const label = `${cityOfZone(tz)} (${tz})`;
    if (!seen.has(label)) { seen.add(label); out.push({ city: cityOfZone(tz), label, tz }); }
  }
  return out;
}
