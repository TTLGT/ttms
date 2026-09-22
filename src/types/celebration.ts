/**
 * Birthdays and work anniversaries, said out loud in the Everyone room.
 *
 * Everything in this file is a pure function over `YYYY-MM-DD` strings and a
 * list of allowlist entries. That is deliberate: the only interesting parts of
 * this feature are which day it is in Guatemala and who counts as celebrating,
 * and both are far easier to reason about — and to read back in six months —
 * when nothing around them is reading Firestore or the clock. The side of it
 * that writes lives in `src/lib/celebrations.ts`.
 *
 * ## The privacy part, which is the reason this file is careful
 *
 * `dateOfBirth` and `startDate` live on `allowedUsers` and are deliberately
 * never mirrored onto `users/{uid}` — that document is readable by every
 * signed-in user, and a birthday is admin-and-HR-only information. See the
 * comment on those fields in src/types/allowedUser.ts.
 *
 * Naming somebody in the Everyone room is therefore a deliberate loosening of
 * that boundary, and it is kept as narrow as the feature allows:
 *
 *  - **The year never leaves.** A birthday message carries a name and nothing
 *    else — no date, no year, no age. What the room learns is "today is Tom's
 *    birthday", which is what a colleague would know anyway; what it does not
 *    learn is how old Tom is or what year he was born.
 *  - **A work anniversary carries a count of years**, which is the point of
 *    saying it at all, and is ordinary employment information rather than
 *    personal data. The start date itself is still never printed.
 *  - **Anyone can stop being named**, per kind, from their own profile page.
 *    See ANNOUNCE_FIELDS below.
 */

/**
 * The office's own timezone, which is what "8am" means here.
 *
 * Guatemala is UTC−6 all year and has not observed daylight saving since 2006,
 * so the cron that calls this is pinned to 14:00 UTC and lands on 8am here
 * permanently. The offset is still not hardcoded: asking Intl for the date in
 * this zone costs nothing and stays correct if Guatemala ever changes its
 * mind, whereas a `-6` written into a date calculation would be wrong for
 * half of every year and nobody would notice until somebody's birthday was
 * announced a day late.
 */
export const OFFICE_TIME_ZONE = 'America/Guatemala';

/** How the company is named in the message. Spelled out, not "TTL" or "TTMS". */
export const COMPANY_NAME = 'Total Transport Logistics';

/**
 * The two per-person switches, on the allowlist entry beside the dates they
 * govern.
 *
 * **Absent means yes**, which is the same trick a room's `policy` keys use and
 * is what let this ship onto live entries with no backfill and no deploy
 * order: nobody has either field yet, and everybody with a date on file is
 * included until they say otherwise. Someone who wants out unticks a box on
 * their own profile page and the entry gains an explicit `false`.
 */
export const ANNOUNCE_FIELDS = {
  birthday:    'announceBirthday',
  anniversary: 'announceAnniversary',
} as const;

export type CelebrationKind = keyof typeof ANNOUNCE_FIELDS;

/** One person celebrating one thing today. */
export interface Celebration {
  kind: CelebrationKind;
  name: string;
  /** Completed years of service. Always ≥ 1, and 0 for a birthday. */
  years: number;
}

/**
 * The fields of an allowlist entry this decides from. A structural type rather
 * than `AllowedUser` so the pure part of this file stays independent of the
 * Firestore document shape, and so a caller can hand it a plain object.
 */
export interface CelebrationCandidate {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  dateOfBirth?: string;
  startDate?: string;
  announceBirthday?: boolean;
  announceAnniversary?: boolean;
  /** Null until first sign-in — a pending invite is not congratulated. */
  uid?: string | null;
  suspended?: boolean;
}

/* ------------------------------------------------------------------ dates */

/**
 * Today's calendar date in the office's timezone, as `YYYY-MM-DD`.
 *
 * `en-CA` is used because it formats as ISO, which is the shape every date in
 * `allowedUsers` is already stored in — so the comparison below is a string
 * comparison and nothing is ever parsed back into a Date that could land on a
 * different day than it started on.
 */
export function officeToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: OFFICE_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/** Splits `YYYY-MM-DD` into numbers. Assumes it is already a valid date. */
function parts(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d };
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * The `MM-DD` endings that count as "today".
 *
 * Normally one. The exception is the 28th of February in a year with no 29th,
 * which stands in for the people born on a leap day — otherwise they would be
 * congratulated once every four years, which is a joke they have heard and not
 * a thing a payroll system should actually do to them.
 *
 * The 28th rather than the 1st of March because it is still February, which is
 * the month they were born in, and because the alternative moves the greeting
 * into a different month for three years out of four.
 */
export function matchingMonthDays(today: string): string[] {
  const { y, m, d } = parts(today);
  const key = `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  if (key === '02-28' && !isLeapYear(y)) return [key, '02-29'];
  return [key];
}

/**
 * Completed years between two `YYYY-MM-DD` dates.
 *
 * `yearsSince()` in src/types/allowedUser.ts answers the same question and is
 * not reused here on purpose: it reads `new Date()`, which on Vercel is UTC,
 * and this runs at 2pm UTC to be 8am in Guatemala. On the 31st of December
 * those are the same day and on the 1st of January they are not — so the count
 * is taken from the office's own date, which the caller has already worked out,
 * rather than from the server's.
 */
export function completedYears(from: string, today: string): number {
  const a = parts(from);
  const b = parts(today);

  let years = b.y - a.y;
  if (b.m < a.m || (b.m === a.m && b.d < a.d)) years -= 1;
  return years;
}

/** The name to use, falling back the same way the rest of the app does. */
function nameOf(person: CelebrationCandidate): string {
  const joined = [person.firstName, person.lastName].filter(Boolean).join(' ').trim();
  return joined || (person.displayName ?? '').trim() || (person.email ?? '').trim();
}

/** Whether a `YYYY-MM-DD` is shaped like one. Junk in the field is skipped. */
function looksLikeDate(value: string | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/* -------------------------------------------------------- who is celebrating */

/**
 * Everybody being congratulated today, birthdays first.
 *
 * Four reasons somebody with a matching date is left out, and all four are
 * deliberate:
 *
 *  - **They have not signed in yet** (`uid` is null). An invite that is still
 *    pending is a name on a list, not a colleague the room would recognise.
 *  - **They are suspended.** Whatever is going on there, a company-wide
 *    greeting is not the right thing to walk into.
 *  - **They said no** to this kind, on their own profile page.
 *  - **Their start date is today or was less than a year ago.** Nought years
 *    is not an anniversary, and saying it on somebody's first morning reads as
 *    a system malfunction rather than a welcome.
 *
 * A future date — a start date not yet reached, a typo'd birth year — falls
 * out of the last rule for anniversaries and is harmless for birthdays, where
 * only the month and day are ever looked at.
 */
export function celebrationsToday(
  people: CelebrationCandidate[],
  today: string,
): Celebration[] {
  const keys = matchingMonthDays(today);
  const matches = (date: string) => keys.includes(date.slice(5));

  const birthdays:     Celebration[] = [];
  const anniversaries: Celebration[] = [];

  for (const person of people) {
    if (!person.uid || person.suspended === true) continue;
    const name = nameOf(person);
    if (!name) continue;

    if (
      person.announceBirthday !== false
      && looksLikeDate(person.dateOfBirth)
      && matches(person.dateOfBirth)
    ) {
      birthdays.push({ kind: 'birthday', name, years: 0 });
    }

    if (
      person.announceAnniversary !== false
      && looksLikeDate(person.startDate)
      && matches(person.startDate)
    ) {
      const years = completedYears(person.startDate, today);
      if (years >= 1) anniversaries.push({ kind: 'anniversary', name, years });
    }
  }

  // Sorted by name within each kind so the wording is stable from one run to
  // the next and does not depend on what order Firestore handed the entries
  // back in.
  const byName = (a: Celebration, b: Celebration) => a.name.localeCompare(b.name);
  return [...birthdays.sort(byName), ...anniversaries.sort(byName)];
}

/* ------------------------------------------------------------- the wording */

/** "A", "A and B", "A, B and C". For names, which carry no punctuation. */
function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The same, with a comma before the "and".
 *
 * Used for the anniversary clauses, which contain commas of their own — so
 * "Ana Cruz, 10 years at Total Transport Logistics today and to Beto Diaz,
 * 1 year" runs the two people together into one sentence that has to be read
 * twice. The comma is what separates them.
 */
function listOfClauses(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * The message, or '' when there is nothing to say today.
 *
 * **This is the one place TTMS is allowed to sound pleased**, and it is worth
 * saying why, because every other automated line in this app is written the
 * opposite way. The order alerts in src/lib/chatAlerts.ts are deliberately
 * flat statements of fact — the moment an automated line starts sounding like
 * a person, people start reading past all of them. That argument holds for a
 * load moving to delivered and does not hold here: a congratulation that
 * reads like a status change is worse than no congratulation, because it
 * tells eleven colleagues that the company could not be bothered.
 *
 * It is still one message rather than one per person. Three lines in a row
 * from TTMS reads as an outage, and on a day with four birthdays it would be
 * four notifications for everybody.
 */
export function celebrationMessage(list: Celebration[]): string {
  const birthdays     = list.filter((c) => c.kind === 'birthday');
  const anniversaries = list.filter((c) => c.kind === 'anniversary');

  const lines: string[] = [];

  if (birthdays.length > 0) {
    lines.push(`Happy birthday to ${listOf(birthdays.map((c) => c.name))}.`);
  }

  if (anniversaries.length > 0) {
    // The "at <company> today" tail is carried by the first clause only, so a
    // day with three anniversaries does not repeat the company's own name
    // three times in one sentence.
    const clauses = anniversaries.map((c, i) => {
      const years = `${c.years} ${c.years === 1 ? 'year' : 'years'}`;
      return i === 0
        ? `${c.name}, ${years} at ${COMPANY_NAME} today`
        : `to ${c.name}, ${years}`;
    });
    lines.push(`Congratulations to ${listOfClauses(clauses)}.`);
  }

  return lines.join('\n\n');
}
