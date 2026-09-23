import { completedYears, type CelebrationKind } from './celebration';

/**
 * The celebrations calendar — birthdays and work anniversaries — and the
 * reminders HR and admins set on it.
 *
 * Pure, like src/types/celebration.ts beside it: every function here works on
 * `YYYY-MM-DD` strings and plain objects, never on Firestore or the clock. The
 * reading and sending live in src/lib/celebrationReminders.ts.
 *
 * ## Who sees this
 *
 * Anyone holding `people.view` — admin and HR by default. That is not a new
 * boundary: birthdays and start dates are already on Settings → People under
 * the same permission, so the calendar is a different view of data those
 * people can already read.
 *
 * ## Ages are shown here, and only here
 *
 * The calendar shows the age somebody is turning, because the people who can
 * open it already read the full date of birth in Settings → People and asked
 * for it. That is the opposite of the Everyone-room post, which carries a name
 * and nothing else — see the note at the top of ./celebration.ts. The two are
 * consistent: the boundary is who is reading, and nothing on this page or in
 * its reminders ever reaches anybody without `people.view`.
 *
 * ## Why it ignores the announcement opt-outs
 *
 * `announceBirthday: false` / `announceAnniversary: false` mean "do not name
 * me in the Everyone room". They do not mean "HR may not know" — HR has the
 * dates on file either way, and planning around them is their job. So
 * everybody with a date is on the calendar, and somebody who opted out is
 * marked so that whoever plans a cake knows not to make it a public one.
 */

export type { CelebrationKind };

export const CELEBRATION_KIND_LABEL: Record<CelebrationKind, string> = {
  birthday:    'Birthday',
  anniversary: 'Work anniversary',
};

/** How far ahead a reminder can be sent. Days before the day itself. */
export const REMINDER_LEADS = [0, 1, 7] as const;
export type ReminderLead = (typeof REMINDER_LEADS)[number];

export function isReminderLead(value: unknown): value is ReminderLead {
  return REMINDER_LEADS.includes(value as ReminderLead);
}

export function isCelebrationKind(value: unknown): value is CelebrationKind {
  return value === 'birthday' || value === 'anniversary';
}

export const REMINDER_LEAD_LABEL: Record<ReminderLead, string> = {
  0: 'On the day',
  1: '1 day before',
  7: '1 week before',
};

/**
 * One person's own reminder setup, at `celebrationReminderSettings/{uid}`.
 *
 * `leadDays` is the standing rule, per kind — "tell me about every birthday
 * this far ahead". Empty means no standing rule, which is the default: nobody
 * should start getting email because a page shipped. Separate per kind
 * because the two are planned differently; a week's notice for a five-year
 * anniversary and the morning of for a birthday is a perfectly ordinary
 * thing to want.
 *
 * The two channels apply to the one-off reminders too. One switch per channel
 * rather than one per reminder, because "I do not read email" is a fact about
 * the person, not about Vivian's birthday.
 */
export interface ReminderSettings {
  leadDays: Record<CelebrationKind, ReminderLead[]>;
  email: boolean;
  chat: boolean;
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  leadDays: { birthday: [], anniversary: [] },
  email: true,
  chat: true,
};

function toLeads(raw: unknown): ReminderLead[] {
  const leads = Array.isArray(raw) ? raw.filter(isReminderLead) : [];
  return [...new Set(leads)].sort((a, b) => a - b);
}

/** Reads a stored settings document defensively — the Console can write anything. */
export function toReminderSettings(raw: unknown): ReminderSettings {
  const r = (raw ?? {}) as { leadDays?: Partial<Record<CelebrationKind, unknown>>; email?: unknown; chat?: unknown };
  return {
    leadDays: {
      birthday:    toLeads(r.leadDays?.birthday),
      anniversary: toLeads(r.leadDays?.anniversary),
    },
    email: typeof r.email === 'boolean' ? r.email : DEFAULT_REMINDER_SETTINGS.email,
    chat:  typeof r.chat  === 'boolean' ? r.chat  : DEFAULT_REMINDER_SETTINGS.chat,
  };
}

/**
 * A reminder about one person's one birthday or anniversary, at
 * `celebrationReminders/{id}`.
 *
 * **Spent once sent**: the daily run deletes it after delivering it. That is
 * what "one-off" means here, and it keeps the collection the size of what is
 * still waiting rather than of everything that has ever been asked for.
 */
export interface OneOffReminder {
  id: string;
  ownerUid: string;
  kind: CelebrationKind;
  /** The allowlist entry it is about, lowercased — the entry's own id. */
  subjectEmail: string;
  /** Their name when the reminder was set, for the list. Re-read when sent. */
  subjectName: string;
  /** The day itself, `YYYY-MM-DD`, in the year it falls. */
  date: string;
  leadDays: ReminderLead;
  /** `date` minus `leadDays`. Stored so the run can query it. */
  sendOn: string;
}

/** Somebody on the calendar. What GET /api/celebration-calendar hands the page. */
export interface CalendarPerson {
  email: string;
  name: string;
  photoPath: string | null;
  /** `YYYY-MM-DD`, or null when none is on file. */
  startDate: string | null;
  /** `YYYY-MM-DD`, or null when none is on file. Admin and HR data. */
  dateOfBirth: string | null;
  /** False when they asked not to be named in the Everyone room, per kind. */
  announced: Record<CelebrationKind, boolean>;
  /** Invited but never signed in. Still an employee, if their dates are right. */
  pending: boolean;
}

/** One birthday or anniversary on one day. */
export interface CalendarOccurrence {
  kind: CelebrationKind;
  person: CalendarPerson;
  /** The date it falls on in this year, `YYYY-MM-DD`. */
  date: string;
  /** The age they turn on a birthday; years with the company on an anniversary. */
  years: number;
}

/* ------------------------------------------------------------------ dates */

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * `YYYY-MM-DD` plus or minus some days.
 *
 * Done in UTC on purpose. These are calendar dates with no time of day, and
 * UTC has no daylight saving, so adding a day is always exactly 24 hours and
 * nothing can slip onto a neighbouring date the way it could in local time.
 */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/**
 * The date a recurring `MM-DD` falls on in a given year.
 *
 * The 29th of February lands on the 28th in a year that has no 29th — the
 * same choice `matchingMonthDays()` makes for the Everyone-room post, so the
 * calendar, the reminders and the greeting all agree on which day it is.
 */
export function dayIn(monthDay: string, year: number): string {
  if (monthDay === '02-29' && !isLeapYear(year)) return `${year}-02-28`;
  return `${year}-${monthDay}`;
}

/**
 * Everybody's birthday and anniversary on one date, if any.
 *
 * A start date gives nothing until it has given a full year: the day somebody
 * joins is not an anniversary, as the Everyone-room post also decides. A
 * birthday likewise needs them to have been born by then, which only matters
 * to somebody paging back through the calendar decades.
 */
function occurrencesFor(person: CalendarPerson, year: number): CalendarOccurrence[] {
  const out: CalendarOccurrence[] = [];
  if (person.dateOfBirth) {
    const date = dayIn(person.dateOfBirth.slice(5), year);
    const age  = completedYears(person.dateOfBirth, date);
    if (age >= 1) out.push({ kind: 'birthday', person, date, years: age });
  }
  if (person.startDate) {
    const date  = dayIn(person.startDate.slice(5), year);
    const years = completedYears(person.startDate, date);
    if (years >= 1) out.push({ kind: 'anniversary', person, date, years });
  }
  return out;
}

/** Birthdays first, then by name — the order they read in on the day. */
function byDayThenKind(a: CalendarOccurrence, b: CalendarOccurrence): number {
  return a.date.localeCompare(b.date)
    || (a.kind === b.kind ? 0 : a.kind === 'birthday' ? -1 : 1)
    || a.person.name.localeCompare(b.person.name);
}

/** Everything falling in one month. `month` is 1–12. */
export function occurrencesInMonth(
  people: CalendarPerson[],
  year: number,
  month: number,
): CalendarOccurrence[] {
  const prefix = `${year}-${pad(month)}`;
  return people
    .flatMap((p) => occurrencesFor(p, year))
    .filter((o) => o.date.startsWith(prefix))
    .sort(byDayThenKind);
}

/** Everything falling on one date, for the standing rule. */
export function occurrencesOn(
  people: CalendarPerson[],
  date: string,
): CalendarOccurrence[] {
  const year = Number(date.slice(0, 4));
  return people
    .flatMap((p) => occurrencesFor(p, year))
    .filter((o) => o.date === date)
    .sort(byDayThenKind);
}

/* ------------------------------------------------------------- the wording */

/** One line of a reminder: who, what, and when. */
export interface ReminderItem {
  kind: CelebrationKind;
  name: string;
  /** The age they turn, or years with the company. */
  years: number;
  /** The day itself, `YYYY-MM-DD`. */
  date: string;
  /** Days from the send date to the day. */
  leadDays: number;
}

/**
 * "Friday, September 26".
 *
 * Spelled out rather than through the company date setting: this text leaves
 * the app in an email and sits in chat as a string, so it cannot follow a
 * setting that changes later — the same call the agreement emails make. No
 * year, because the "in a week" beside it already says which one.
 */
export function spelledOutDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

function whenPhrase(leadDays: number): string {
  if (leadDays === 0) return 'today';
  if (leadDays === 1) return 'tomorrow';
  if (leadDays === 7) return 'in a week';
  return `in ${leadDays} days`;
}

/**
 * "Vivian De León — 5 years with the company, in a week (Friday, September 26)."
 * "Tom Reed — birthday, turning 34, today."
 */
export function reminderLine(item: ReminderItem): string {
  const what = item.kind === 'birthday'
    ? `birthday, turning ${item.years}`
    : `${item.years} ${item.years === 1 ? 'year' : 'years'} with the company`;
  return item.leadDays === 0
    ? `${item.name} — ${what}, today.`
    : `${item.name} — ${what}, ${whenPhrase(item.leadDays)} (${spelledOutDay(item.date)}).`;
}

/** The first line, and the email subject's gist. Says which kinds are in it. */
export function reminderHeading(items: ReminderItem[]): string {
  const kinds = new Set(items.map((i) => i.kind));
  if (kinds.size > 1) return 'Birthdays and work anniversaries coming up:';
  const many = items.length > 1;
  return kinds.has('birthday')
    ? (many ? 'Birthdays coming up:' : 'Birthday coming up:')
    : (many ? 'Work anniversaries coming up:' : 'Work anniversary coming up:');
}

/**
 * The whole reminder, soonest first.
 *
 * Plain and flat on purpose, like the load alerts in src/lib/chatAlerts.ts:
 * this is a note to the person planning, not the greeting itself — that is
 * the Everyone-room post, and it is the one allowed to sound pleased.
 */
export function reminderText(items: ReminderItem[]): string {
  const sorted = [...items].sort((a, b) =>
    a.leadDays - b.leadDays
    || (a.kind === b.kind ? 0 : a.kind === 'birthday' ? -1 : 1)
    || a.name.localeCompare(b.name));
  return [reminderHeading(sorted), ...sorted.map(reminderLine)].join('\n');
}
