'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BellRing, Briefcase, Cake, Mail, MessageCircle, Trash2, X,
  type LucideIcon,
} from 'lucide-react';
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
import { HOLIDAY_COUNTRY_LABEL, type Holiday, type HolidayCountry } from '@/types/holidays';

/**
 * The birthday and work-anniversary half of the Calendar, for admin and HR.
 *
 * It used to be its own page (/dashboard/celebrations, which now redirects to
 * the Calendar). The boundary did not move with it: everything here comes
 * from /api/celebration-calendar, which refuses anybody without
 * `people.view`, and `useCelebrationCalendar(false)` never calls it — so a
 * broker's browser never receives a colleague's birthday, whatever the page
 * draws. See src/types/celebrationCalendar.ts.
 *
 * Keep birthdays out of the personal task list, including as a convenience
 * ("add to my tasks"): that list is private and nobody re-checks it when
 * somebody leaves HR, which is exactly what this permission is there for.
 */

/** How far ahead the "Coming up" list looks. */
const UPCOMING_DAYS = 30;

/**
 * How each kind is drawn. One place, so a chip, a list row and a reminder all
 * agree on which colour means which.
 */
/**
 * The calendar's layers keep clear of the six task colours (yellow, pink,
 * sky, green, violet, orange — NOTE_STYLE in src/components/tasks/taskStyle.ts),
 * so a pink chip on the calendar is always a pink task and never a birthday.
 * Of the families tailwind.config.ts maps for dark and dim, indigo, teal and
 * grey are the ones far enough from all six; a layer added later should take
 * one of those, or red, which is left alone because it means overdue.
 */
export const KIND_STYLE: Record<CelebrationKind, {
  Icon: LucideIcon; chip: string; chipOn: string; icon: string; plural: string;
}> = {
  birthday: {
    Icon: Cake,
    chip: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
    chipOn: 'bg-indigo-600 text-white',
    icon: 'text-indigo-500',
    plural: 'Birthdays',
  },
  anniversary: {
    Icon: Briefcase,
    chip: 'bg-teal-50 text-teal-700 hover:bg-teal-100',
    chipOn: 'bg-teal-600 text-white',
    icon: 'text-teal-600',
    plural: 'Work anniversaries',
  },
};

/**
 * Holidays are drawn quieter than people: they are the backdrop the planning
 * happens against, not the thing being planned. Both grey, to stay clear of
 * the task colours (see KIND_STYLE): filled for Guatemala, where the office
 * is; outlined for the US, where the freight is. The GT/US tag on each says
 * which as well, so the two never rest on shade alone.
 */
export const HOLIDAY_STYLE: Record<HolidayCountry, string> = {
  GT: 'bg-gray-100 text-gray-700',
  US: 'border border-gray-300 bg-white text-gray-700',
};

export function holidayTitle(h: Holiday): string {
  return `${HOLIDAY_COUNTRY_LABEL[h.country]}: ${h.name}${h.note ? ` — ${h.note}` : ''}`;
}

function years(n: number): string {
  return `${n} ${n === 1 ? 'year' : 'years'}`;
}

/** "Turning 34" / "5 years with the company". */
export function whatItIs(o: CalendarOccurrence): string {
  return o.kind === 'birthday' ? `Turning ${o.years}` : `${years(o.years)} with the company`;
}

export const sameOccurrence = (a: CalendarOccurrence | null, b: CalendarOccurrence) =>
  a !== null && a.kind === b.kind && a.person.email === b.person.email && a.date === b.date;

/**
 * The celebration data and every change to it. `allowed` false never makes
 * the request — the server would refuse it, and asking is itself a tell.
 */
export function useCelebrationCalendar(allowed: boolean) {
  const [data, setData]     = useState<CalendarData | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy]     = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await fetchCalendar());
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not load birthdays and anniversaries');
    }
  }, []);

  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  // Settings save as they are ticked. There is one person's own preference on
  // the other end of each box, and a Save button beside a column of
  // checkboxes is a button somebody forgets to press.
  const updateSettings = async (next: ReminderSettings) => {
    if (!data) return;
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

  return { data, notice, setNotice, busy, updateSettings, addReminder, removeReminder };
}

/* ------------------------------------------------------------------ panels */

/** "Your reminders" for birthdays and anniversaries: the standing rules, the channels, the one-offs. */
export function CelebrationReminderPanel({
  data, busy, formatCalendarDate, onSettings, onRemove,
}: {
  data: CalendarData;
  busy: boolean;
  formatCalendarDate: (v: string | null | undefined) => string;
  onSettings: (next: ReminderSettings) => void;
  onRemove: (id: string) => void;
}) {
  const { settings, reminders } = data;
  const noChannel = !settings.email && !settings.chat;

  const toggleLead = (kind: CelebrationKind, leadDays: ReminderLead, on: boolean) => {
    const current = settings.leadDays[kind];
    onSettings({
      ...settings,
      leadDays: {
        ...settings.leadDays,
        [kind]: on ? [...current, leadDays] : current.filter((l) => l !== leadDays),
      },
    });
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <BellRing size={15} className="text-brand-600" /> Birthday and anniversary reminders
      </h2>
      <p className="mt-1 text-xs text-gray-500">
        Sent at 8am Guatemala time. Only you get them. Only admins and HR see birthdays and anniversaries.
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
            onChange={(e) => onSettings({ ...settings, email: e.target.checked })}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
          <Mail size={14} className="text-gray-400" /> Email
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" disabled={busy} checked={settings.chat}
            onChange={(e) => onSettings({ ...settings, chat: e.target.checked })}
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
                <button type="button" disabled={busy} onClick={() => onRemove(r.id)}
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
  );
}

/** The next thirty days of birthdays and anniversaries. */
export function UpcomingCelebrations({
  data, showing, formatCalendarDate, onPick,
}: {
  data: CalendarData;
  showing: Record<CelebrationKind, boolean>;
  formatCalendarDate: (v: string | null | undefined) => string;
  onPick: (o: CalendarOccurrence) => void;
}) {
  const upcoming = useMemo(() => {
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

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">Birthdays and anniversaries, next {UPCOMING_DAYS} days</h2>
      {upcoming.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing coming up.</p>
      ) : (
        <OccurrenceList items={upcoming} formatCalendarDate={formatCalendarDate} onPick={onPick} compact />
      )}
    </section>
  );
}

export function OccurrenceList({
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
                  <Icon size={11} className={KIND_STYLE[o.kind].icon} />
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
export function PersonBadges({ occurrence }: { occurrence: CalendarOccurrence }) {
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

/** One birthday or anniversary, opened from the calendar: who, when, and one-off reminders for it. */
export function CelebrationDetail({
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
            <Icon size={14} className={KIND_STYLE[kind].icon} />
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
