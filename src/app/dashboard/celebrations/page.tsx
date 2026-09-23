'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BellRing, Briefcase, Cake, ChevronLeft, ChevronRight, Landmark, Mail, MessageCircle, Trash2, X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { UserAvatar } from '@/components/settings/UserAvatar';
import {
  addOneOffReminder,
  deleteOneOffReminder,
  fetchCalendar,
  saveReminderSettings,
  type CalendarData,
} from '@/lib/celebrationCalendar';
import {
  REMINDER_LEADS,
  REMINDER_LEAD_LABEL,
  addDays,
  occurrencesInMonth,
  type CalendarOccurrence,
  type CelebrationKind,
  type ReminderLead,
  type ReminderSettings,
} from '@/types/celebrationCalendar';
import {
  HOLIDAY_COUNTRY_LABEL,
  holidaysInMonth,
  type Holiday,
  type HolidayCountry,
} from '@/types/holidays';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** How far ahead the "Coming up" list looks. */
const UPCOMING_DAYS = 30;

/**
 * How each kind is drawn. One place, so a chip, a list row and a reminder all
 * agree on which colour means which.
 */
const KIND_STYLE: Record<CelebrationKind, {
  Icon: LucideIcon; chip: string; chipOn: string; plural: string;
}> = {
  birthday: {
    Icon: Cake,
    chip: 'bg-pink-50 text-pink-700 hover:bg-pink-100',
    chipOn: 'bg-pink-600 text-white',
    plural: 'Birthdays',
  },
  anniversary: {
    Icon: Briefcase,
    chip: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
    chipOn: 'bg-brand-600 text-white',
    plural: 'Work anniversaries',
  },
};

function years(n: number): string {
  return `${n} ${n === 1 ? 'year' : 'years'}`;
}

/** "Turning 34" / "5 years with the company". */
function whatItIs(o: CalendarOccurrence): string {
  return o.kind === 'birthday' ? `Turning ${o.years}` : `${years(o.years)} with the company`;
}

/** "September 2026" — a month, not a date, so not the company date setting's business. */
function monthTitle(year: number, month: number): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

/**
 * Holidays are drawn quieter than people: they are the backdrop the planning
 * happens against, not the thing being planned. Grey for Guatemala, where the
 * office is; sky for the US, where the freight is.
 */
const HOLIDAY_STYLE: Record<HolidayCountry, string> = {
  GT: 'bg-gray-100 text-gray-700',
  US: 'bg-sky-50 text-sky-700',
};

function holidayTitle(h: Holiday): string {
  return `${HOLIDAY_COUNTRY_LABEL[h.country]}: ${h.name}${h.note ? ` — ${h.note}` : ''}`;
}

const sameOccurrence = (a: CalendarOccurrence | null, b: CalendarOccurrence) =>
  a !== null && a.kind === b.kind && a.person.email === b.person.email && a.date === b.date;

/**
 * Birthdays and work anniversaries, for admin and HR.
 *
 * Gated on `people.view`, the same permission that shows these dates in
 * Settings → People — see src/types/celebrationCalendar.ts. The sidebar hides
 * the link from everybody else and the API refuses them; this page's own check
 * only stops it drawing an empty shell in the moment before the layout
 * redirects.
 */
export default function CelebrationsPage() {
  const { can } = useAuth();
  const { formatCalendarDate } = useDateFormatters();

  const [data, setData]         = useState<CalendarData | null>(null);
  const [error, setError]       = useState('');
  const [notice, setNotice]     = useState('');
  const [busy, setBusy]         = useState(false);
  const [cursor, setCursor]     = useState<{ year: number; month: number } | null>(null);
  const [selected, setSelected] = useState<CalendarOccurrence | null>(null);
  const [showing, setShowing]   = useState<Record<CelebrationKind, boolean>>({ birthday: true, anniversary: true });
  const [countries, setCountries] = useState<Record<HolidayCountry, boolean>>({ GT: true, US: true });

  const allowed = can('people.view');

  const load = useCallback(async () => {
    try {
      const next = await fetchCalendar();
      setData(next);
      setCursor((c) => c ?? { year: Number(next.today.slice(0, 4)), month: Number(next.today.slice(5, 7)) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the calendar');
    }
  }, []);

  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  const occurrences = useMemo(
    () => (data && cursor
      ? occurrencesInMonth(data.people, cursor.year, cursor.month).filter((o) => showing[o.kind])
      : []),
    [data, cursor, showing],
  );

  const holidays = useMemo(
    () => (cursor ? holidaysInMonth(cursor.year, cursor.month).filter((h) => countries[h.country]) : []),
    [cursor, countries],
  );

  const upcoming = useMemo(() => {
    if (!data) return [];
    const today = data.today;
    const until = addDays(today, UPCOMING_DAYS);
    const y = Number(today.slice(0, 4));
    const m = Number(today.slice(5, 7));
    const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
    return [
      ...occurrencesInMonth(data.people, y, m),
      ...occurrencesInMonth(data.people, next.y, next.m),
    ].filter((o) => showing[o.kind] && o.date >= today && o.date <= until);
  }, [data, showing]);

  if (!allowed) return null;

  if (error && !data) {
    return <div className="p-4 sm:p-6 lg:p-8"><p className="text-sm text-red-600">{error}</p></div>;
  }
  if (!data || !cursor) {
    return <div className="p-4 sm:p-6 lg:p-8"><p className="text-sm text-gray-500">Loading…</p></div>;
  }

  const byDay = new Map<string, CalendarOccurrence[]>();
  for (const o of occurrences) byDay.set(o.date, [...(byDay.get(o.date) ?? []), o]);
  const holidaysByDay = new Map<string, Holiday[]>();
  for (const h of holidays) holidaysByDay.set(h.date, [...(holidaysByDay.get(h.date) ?? []), h]);

  const first  = new Date(Date.UTC(cursor.year, cursor.month - 1, 1));
  const lead   = first.getUTCDay();
  const daysIn = new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysIn }, (_, i) =>
      `${cursor.year}-${String(cursor.month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const shiftMonth = (by: number) => {
    setSelected(null);
    setCursor((c) => {
      if (!c) return c;
      const index = c.year * 12 + (c.month - 1) + by;
      return { year: Math.floor(index / 12), month: (index % 12) + 1 };
    });
  };

  // Settings save as they are ticked. There is one person's own preference on
  // the other end of each box, and a Save button beside a column of
  // checkboxes is a button somebody forgets to press.
  const updateSettings = async (next: ReminderSettings) => {
    setData({ ...data, settings: next });
    setBusy(true);
    setNotice('');
    try {
      const saved = await saveReminderSettings(next);
      setData((d) => (d ? { ...d, settings: saved } : d));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not save that');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const toggleLead = (kind: CelebrationKind, leadDays: ReminderLead, on: boolean) => {
    const current = data.settings.leadDays[kind];
    updateSettings({
      ...data.settings,
      leadDays: {
        ...data.settings.leadDays,
        [kind]: on ? [...current, leadDays] : current.filter((l) => l !== leadDays),
      },
    });
  };

  const addReminder = async (o: CalendarOccurrence, leadDays: ReminderLead) => {
    setBusy(true);
    setNotice('');
    try {
      const reminder = await addOneOffReminder({
        kind: o.kind, subjectEmail: o.person.email, date: o.date, leadDays,
      });
      setData((d) => d && {
        ...d,
        reminders: [...d.reminders.filter((r) => r.id !== reminder.id), reminder]
          .sort((a, b) => a.sendOn.localeCompare(b.sendOn)),
      });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not set that reminder');
    } finally {
      setBusy(false);
    }
  };

  const removeReminder = async (id: string) => {
    setBusy(true);
    setNotice('');
    try {
      await deleteOneOffReminder(id);
      setData((d) => d && { ...d, reminders: d.reminders.filter((r) => r.id !== id) });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not remove that reminder');
    } finally {
      setBusy(false);
    }
  };

  const { settings, reminders, today } = data;
  const noChannel = !settings.email && !settings.chat;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Celebrations</h1>
        <p className="mt-1 text-sm text-gray-500">
          Birthdays and work anniversaries for everyone with a date on file, and public holidays in Guatemala and the US. Only admins and HR can see this page.
        </p>
      </div>

      {notice && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* ── The calendar ─────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white">
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-3">
              <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month"
                className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100">
                <ChevronLeft size={18} />
              </button>
              <h2 className="min-w-[10rem] text-center text-base font-semibold text-gray-900">
                {monthTitle(cursor.year, cursor.month)}
              </h2>
              <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month"
                className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100">
                <ChevronRight size={18} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setCursor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
                }}
                className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                This month
              </button>

              {/* Which kinds are drawn. Both on by default; one off is how
                  somebody planning only anniversary lunches gets a calendar
                  of just those. */}
              <div className="ml-auto flex gap-1.5">
                {(['birthday', 'anniversary'] as const).map((kind) => {
                  const { Icon, plural } = KIND_STYLE[kind];
                  return (
                    <button
                      key={kind}
                      type="button"
                      aria-pressed={showing[kind]}
                      onClick={() => {
                        setSelected(null);
                        setShowing((s) => ({ ...s, [kind]: !s[kind] }));
                      }}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                        showing[kind] ? KIND_STYLE[kind].chip : 'bg-gray-100 text-gray-400 line-through'
                      }`}
                    >
                      <Icon size={12} /> {plural}
                    </button>
                  );
                })}
                {(['GT', 'US'] as const).map((country) => (
                  <button
                    key={country}
                    type="button"
                    aria-pressed={countries[country]}
                    onClick={() => setCountries((c) => ({ ...c, [country]: !c[country] }))}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                      countries[country] ? HOLIDAY_STYLE[country] : 'bg-gray-100 text-gray-400 line-through'
                    }`}
                  >
                    <Landmark size={12} /> {HOLIDAY_COUNTRY_LABEL[country]} holidays
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-7 border-b border-gray-100 text-center text-[11px] font-medium uppercase tracking-wide text-gray-400">
              {WEEKDAYS.map((d) => <div key={d} className="py-2">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((date, i) => {
                const here = date ? byDay.get(date) ?? [] : [];
                const off  = date ? holidaysByDay.get(date) ?? [] : [];
                return (
                  <div
                    key={date ?? `blank-${i}`}
                    className={`min-h-[5.5rem] border-b border-r border-gray-100 p-1 ${
                      date === null ? 'bg-gray-50/60' : ''
                    } ${i % 7 === 6 ? 'border-r-0' : ''}`}
                  >
                    {date && (
                      <>
                        <div className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                          date === today ? 'bg-brand-600 font-semibold text-white' : 'text-gray-500'
                        }`}>
                          {Number(date.slice(8))}
                        </div>
                        <div className="space-y-1">
                          {off.map((h) => (
                            <div
                              key={`${h.country}-${h.name}`}
                              title={holidayTitle(h)}
                              className={`flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[11px] ${HOLIDAY_STYLE[h.country]}`}
                            >
                              <span className="flex-shrink-0 font-semibold">{h.country}</span>
                              <span className="truncate">{h.name.replace(/ \(.*\)$/, '')}</span>
                            </div>
                          ))}
                          {here.map((o) => {
                            const { Icon, chip, chipOn } = KIND_STYLE[o.kind];
                            return (
                              <button
                                key={`${o.kind}-${o.person.email}`}
                                type="button"
                                onClick={() => setSelected(o)}
                                title={`${o.person.name} — ${whatItIs(o)}`}
                                className={`flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium ${
                                  sameOccurrence(selected, o) ? chipOn : chip
                                }`}
                              >
                                <Icon size={10} className="flex-shrink-0" />
                                <span className="truncate">{o.person.name.split(' ')[0]} · {o.years}</span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {selected && (
            <Selected
              occurrence={selected}
              today={today}
              reminders={reminders}
              busy={busy}
              formatCalendarDate={formatCalendarDate}
              onAdd={(leadDays) => addReminder(selected, leadDays)}
              onRemove={removeReminder}
              onClose={() => setSelected(null)}
            />
          )}

          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">
              In {monthTitle(cursor.year, cursor.month)}
            </h2>
            {occurrences.length === 0 ? (
              <p className="text-sm text-gray-500">No birthdays or anniversaries this month.</p>
            ) : (
              <OccurrenceList
                items={occurrences}
                formatCalendarDate={formatCalendarDate}
                onPick={setSelected}
              />
            )}

            {holidays.length > 0 && (
              <>
                <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500">Holidays</h3>
                <ul className="divide-y divide-gray-100">
                  {holidays.map((h) => (
                    <li key={`${h.country}-${h.date}-${h.name}`} className="flex items-start gap-3 py-2">
                      <span className={`mt-0.5 flex-shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${HOLIDAY_STYLE[h.country]}`}>
                        {h.country}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900">{h.name}</p>
                        <p className="text-xs text-gray-500">
                          {formatCalendarDate(h.date)}{h.note ? ` · ${h.note}` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>

        {/* ── Reminders ────────────────────────────────────────────────── */}
        <aside className="space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <BellRing size={15} className="text-brand-600" /> Your reminders
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Sent at 8am Guatemala time. Only you get them.
            </p>

            {(['birthday', 'anniversary'] as const).map((kind) => (
              <div key={kind}>
                <p className="mt-4 text-xs font-medium text-gray-700">
                  Remind me about every {kind === 'birthday' ? 'birthday' : 'work anniversary'}
                </p>
                <div className="mt-2 space-y-1.5">
                  {REMINDER_LEADS.map((leadDays) => (
                    <label key={leadDays} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        disabled={busy}
                        checked={settings.leadDays[kind].includes(leadDays)}
                        onChange={(e) => toggleLead(kind, leadDays, e.target.checked)}
                        className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                      {REMINDER_LEAD_LABEL[leadDays]}
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <p className="mt-4 text-xs font-medium text-gray-700">Send them by</p>
            <div className="mt-2 space-y-1.5">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" disabled={busy} checked={settings.email}
                  onChange={(e) => updateSettings({ ...settings, email: e.target.checked })}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                <Mail size={14} className="text-gray-400" /> Email
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" disabled={busy} checked={settings.chat}
                  onChange={(e) => updateSettings({ ...settings, chat: e.target.checked })}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                <MessageCircle size={14} className="text-gray-400" /> A private chat message
              </label>
            </div>
            {noChannel && (
              <p className="mt-2 text-xs text-amber-700">
                With both off, nothing is sent — not even the one-off reminders below.
              </p>
            )}

            <p className="mt-5 text-xs font-medium text-gray-700">One-off reminders</p>
            {reminders.length === 0 ? (
              <p className="mt-1 text-xs text-gray-500">
                None yet. Click a name on the calendar to set one.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-gray-100">
                {reminders.map((r) => {
                  const { Icon } = KIND_STYLE[r.kind] ?? KIND_STYLE.anniversary;
                  return (
                    <li key={r.id} className="flex items-center gap-2 py-2">
                      <Icon size={14} className="flex-shrink-0 text-gray-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-gray-800">{r.subjectName}</p>
                        <p className="text-xs text-gray-500">
                          {REMINDER_LEAD_LABEL[r.leadDays]} · {formatCalendarDate(r.date)}
                        </p>
                      </div>
                      <button type="button" disabled={busy} onClick={() => removeReminder(r.id)}
                        aria-label="Remove reminder"
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Next {UPCOMING_DAYS} days</h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-gray-500">Nothing coming up.</p>
            ) : (
              <OccurrenceList
                items={upcoming}
                formatCalendarDate={formatCalendarDate}
                onPick={(o) => {
                  setCursor({ year: Number(o.date.slice(0, 4)), month: Number(o.date.slice(5, 7)) });
                  setSelected(o);
                }}
                compact
              />
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function OccurrenceList({
  items, formatCalendarDate, onPick, compact,
}: {
  items: CalendarOccurrence[];
  formatCalendarDate: (v: string | null | undefined) => string;
  onPick: (o: CalendarOccurrence) => void;
  compact?: boolean;
}) {
  return (
    <ul className="divide-y divide-gray-100">
      {items.map((o) => {
        const { Icon } = KIND_STYLE[o.kind];
        return (
          <li key={`${o.kind}-${o.person.email}-${o.date}`}>
            <button type="button" onClick={() => onPick(o)}
              className="flex w-full items-center gap-3 py-2 text-left hover:bg-gray-50">
              <UserAvatar photoPath={o.person.photoPath} fallback={o.person.name.charAt(0).toUpperCase()}
                size={compact ? 28 : 32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{o.person.name}</p>
                <p className="flex items-center gap-1 text-xs text-gray-500">
                  <Icon size={11} className={o.kind === 'birthday' ? 'text-pink-500' : 'text-brand-500'} />
                  {formatCalendarDate(o.date)} · {whatItIs(o)}
                </p>
              </div>
              {!compact && <PersonBadges occurrence={o} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The two things worth knowing before planning anything.
 *
 * "Not announced" is the one that matters: that person asked not to be named
 * in the Everyone room for this kind, so a public cake is the wrong idea even
 * though HR is right to know the date.
 */
function PersonBadges({ occurrence }: { occurrence: CalendarOccurrence }) {
  return (
    <div className="flex flex-shrink-0 gap-1">
      {!occurrence.person.announced[occurrence.kind] && (
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600"
          title="Asked not to be named in the Everyone room">
          Not announced
        </span>
      )}
      {occurrence.person.pending && (
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700"
          title="Invited to TTMS but has not signed in yet">
          Not signed in
        </span>
      )}
    </div>
  );
}

function Selected({
  occurrence, today, reminders, busy, formatCalendarDate, onAdd, onRemove, onClose,
}: {
  occurrence: CalendarOccurrence;
  today: string;
  reminders: CalendarData['reminders'];
  busy: boolean;
  formatCalendarDate: (v: string | null | undefined) => string;
  onAdd: (leadDays: ReminderLead) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const { kind, person, date } = occurrence;
  const { Icon } = KIND_STYLE[kind];
  const mine = reminders.filter((r) =>
    r.kind === kind && r.subjectEmail === person.email && r.date === date);

  return (
    <section className={`rounded-xl border bg-white p-4 ${kind === 'birthday' ? 'border-pink-200' : 'border-brand-200'}`}>
      <div className="flex items-start gap-3">
        <UserAvatar photoPath={person.photoPath} fallback={person.name.charAt(0).toUpperCase()} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-gray-900">{person.name}</p>
          <p className="flex items-center gap-1.5 text-sm text-gray-600">
            <Icon size={14} className={kind === 'birthday' ? 'text-pink-500' : 'text-brand-500'} />
            {kind === 'birthday'
              ? `Birthday on ${formatCalendarDate(date)} — turning ${occurrence.years}`
              : `${years(occurrence.years)} with the company on ${formatCalendarDate(date)}`}
          </p>
          <p className="text-xs text-gray-500">
            {kind === 'birthday'
              ? `Born ${formatCalendarDate(person.dateOfBirth)}`
              : `Started ${formatCalendarDate(person.startDate)}`}
          </p>
          <div className="mt-1.5"><PersonBadges occurrence={occurrence} /></div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close"
          className="rounded p-1 text-gray-400 hover:bg-gray-100"><X size={16} /></button>
      </div>

      <p className="mt-4 text-xs font-medium text-gray-700">Remind me about this one</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {REMINDER_LEADS.map((leadDays) => {
          const existing = mine.find((r) => r.leadDays === leadDays);
          // The run is at 8am, so a send date of today has already gone by
          // the time anybody is reading this. The server refuses it too.
          const tooLate = addDays(date, -leadDays) <= today;
          if (existing) {
            return (
              <button key={leadDays} type="button" disabled={busy} onClick={() => onRemove(existing.id)}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700">
                <BellRing size={12} /> {REMINDER_LEAD_LABEL[leadDays]}
                <X size={12} className="opacity-70" />
              </button>
            );
          }
          return (
            <button key={leadDays} type="button" disabled={busy || tooLate} onClick={() => onAdd(leadDays)}
              title={tooLate ? 'Reminders go out at 8am — this one would already have been sent.' : undefined}
              className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40">
              {REMINDER_LEAD_LABEL[leadDays]}
            </button>
          );
        })}
      </div>
    </section>
  );
}
