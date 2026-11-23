'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, List, RotateCcw, Trash2 } from 'lucide-react';
import DateField from '@/components/DateField';
import {
  deleteHolidayOverride,
  fetchConfig,
  fetchHolidayOverrides,
  fetchReminders,
  fetchSchedules,
  moveLunch,
  saveConfig,
  saveHolidayOverride,
  saveReminderOverride,
  saveSchedule,
  type RemindersResponse,
  type SchedulesResponse,
} from '@/lib/attendance';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { Bi } from '@/components/spanish/Es';
import { useSaveBarEntry } from '@/components/settings/kit/SaveBar';
import { PreviewBox } from '@/components/settings/kit/ui';
import {
  BACK_ON_TIME_LEAD,
  DEFAULT_SCHEDULE_ID,
  MAX_GRACE_MINUTES,
  STANDARD_SCHEDULE,
  WEEKDAYS,
  WEEKDAY_LABEL,
  type AttendanceConfig,
  type BackOnTimeSettings,
  type Schedule,
  type WeekdayKey,
} from '@/types/attendance';
import {
  MINUTES_LIMITS,
  REMINDER_KINDS,
  REMINDER_LABEL,
  type BreakReminderSettings,
  type ReminderKind,
  type ReminderOverride,
  type SlotReminder,
} from '@/types/breakReminders';
import {
  HOLIDAY_COUNTRY_LABEL,
  observedHolidaysInYear,
  type HolidayCountry,
  type HolidayOverride,
} from '@/types/holidays';

/**
 * Everything HR sets up once and then leaves: schedules, holidays, the office
 * networks, the "not in yet" alerts and the break reminders. `attendance.manage` — every route
 * behind these panels checks it again.
 */
export default function AttendanceSetup() {
  // Lunch times and break reminders edit the same settings; a save in either
  // bumps this so the other reloads instead of showing the old lunch.
  const [remindersVersion, setRemindersVersion] = useState(0);
  const bump = useCallback(() => setRemindersVersion((v) => v + 1), []);
  return (
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <div id="attendance-schedules" className="scroll-mt-6"><SchedulesPanel /></div>
      <div className="space-y-6">
        <div id="attendance-holidays" className="scroll-mt-6"><HolidaysPanel /></div>
        <div id="lunch-times" className="scroll-mt-6"><LunchTimesPanel version={remindersVersion} onSaved={bump} /></div>
        <div id="break-reminders" className="scroll-mt-6"><RemindersPanel version={remindersVersion} onSaved={bump} /></div>
        <div id="back-on-time" className="scroll-mt-6"><BackOnTimePanel /></div>
        <div id="office-network" className="scroll-mt-6"><NetworkPanel /></div>
      </div>
    </div>
  );
}

/**
 * Settings → Lunch and breaks: the three panels that edit the same reminder
 * settings, on one page. Each panel is also exported on its own for the
 * Settings pages that hold just one (schedules, holidays, office network).
 */
export function LunchAndBreaks() {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  return (
    <div className="space-y-6">
      <div id="lunch-times" className="scroll-mt-6"><LunchTimesPanel version={version} onSaved={bump} /></div>
      <div id="break-reminders" className="scroll-mt-6"><RemindersPanel version={version} onSaved={bump} /></div>
      <div id="back-on-time" className="scroll-mt-6"><BackOnTimePanel /></div>
    </div>
  );
}

const card = 'rounded-xl border border-gray-200 bg-white p-5';
const h2 = 'text-sm font-semibold uppercase tracking-wide text-gray-900';
const lede = 'mt-1 text-sm text-gray-500';

// ── Schedules ────────────────────────────────────────────────────────────────

export function SchedulesPanel() {
  const [data, setData] = useState<SchedulesResponse | null>(null);
  const [target, setTarget] = useState(DEFAULT_SCHEDULE_ID);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setData(await fetchSchedules()); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load schedules'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!data) return <section className={card}><h2 className={h2}><Bi>Schedules</Bi></h2><p className={lede}>{error || 'Loading…'}</p></section>;

  const own = target === DEFAULT_SCHEDULE_ID ? data.fallback : data.byEmail[target] ?? null;
  const personName = data.people.find((p) => p.email === target)?.name;

  return (
    <section className={card}>
      <h2 className={h2}><Bi>Schedules</Bi></h2>
      <p className={lede}>
        <Bi>When each person is expected in, in office time. Anybody without a schedule of their own follows the company
        one. Nobody is ever marked late or absent without one — until the company schedule is saved, nobody is.</Bi>
      </p>

      <select value={target} onChange={(e) => setTarget(e.target.value)} className="mt-4 w-full rounded-lg border border-gray-300 py-1.5 pl-3 pr-8 text-sm">
        <option data-es value={DEFAULT_SCHEDULE_ID}>Company schedule (everyone without their own)</option>
        {data.people.map((p) => (
          <option key={p.email} value={p.email}>
            {p.name}{data.byEmail[p.email] ? ' — own schedule' : ''}{p.pending ? ' (not signed in yet)' : ''}
          </option>
        ))}
      </select>

      <ScheduleEditor
        key={target}
        initial={own}
        isDefault={target === DEFAULT_SCHEDULE_ID}
        fallback={data.fallback}
        onSave={async (s) => { await saveSchedule(target, s); await load(); }}
        who={target === DEFAULT_SCHEDULE_ID ? 'the company' : personName ?? target}
      />
    </section>
  );
}

function ScheduleEditor({
  initial, isDefault, fallback, onSave, who,
}: {
  initial: Schedule | null;
  isDefault: boolean;
  fallback: Schedule | null;
  onSave: (s: Schedule | null) => Promise<void>;
  who: string;
}) {
  const start = initial ?? fallback ?? STANDARD_SCHEDULE;
  const [s, setS] = useState<Schedule>(start);
  const [base, setBase] = useState<Schedule>(start);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  // A change to an existing schedule goes through Settings' Save bar. A
  // schedule nobody has saved yet still needs its own button below: the
  // suggested week is not a change, so the bar would never appear for it.
  const dirty = JSON.stringify(s) !== JSON.stringify(base);
  const { active } = useSaveBarEntry({
    dirty: Boolean(initial) && dirty,
    save: async () => {
      const previous = base;
      await onSave(s);
      setBase(s);
      return async () => { await onSave(previous); setBase(previous); setS(previous); };
    },
    discard: () => setS(base),
  });

  async function save(next: Schedule | null) {
    setBusy(true); setMsg(''); setError('');
    try {
      await onSave(next);
      setMsg(next ? 'Saved. It applies from today; days already closed keep their verdict.' : 'Cleared.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-3 text-sm">
      {!initial && (
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-gray-600">
          {isDefault
            ? 'No company schedule yet. The week below is a suggestion until you save it.'
            : fallback ? `${who} follows the company schedule. Save below to give them their own.` : `${who} is not scheduled.`}
        </p>
      )}
      <table className="w-full">
        <tbody>
          {WEEKDAYS.map((d) => {
            const shift = s.days[d];
            return (
              <tr key={d}>
                <td className="py-1 pr-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(shift)}
                      onChange={(e) => setS({ ...s, days: { ...s.days, [d]: e.target.checked ? { ...STANDARD_SCHEDULE.days.mon! } : null } })}
                    />
                    {WEEKDAY_LABEL[d]}
                  </label>
                </td>
                <td className="py-1">
                  {shift ? (
                    <span className="flex items-center gap-1.5">
                      <input type="time" value={shift.start} onChange={(e) => setS({ ...s, days: { ...s.days, [d]: { ...shift, start: e.target.value } } })}
                        className="rounded-lg border border-gray-300 px-2 py-1" />
                      –
                      <input type="time" value={shift.end} onChange={(e) => setS({ ...s, days: { ...s.days, [d]: { ...shift, end: e.target.value } } })}
                        className="rounded-lg border border-gray-300 px-2 py-1" />
                    </span>
                  ) : <span data-es className="text-gray-400">Day off</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          Holidays of
          <select value={s.holidayCountry} onChange={(e) => setS({ ...s, holidayCountry: e.target.value as HolidayCountry })}
            className="rounded-lg border border-gray-300 py-1 pl-2 pr-7">
            {(Object.keys(HOLIDAY_COUNTRY_LABEL) as HolidayCountry[]).map((c) => <option key={c} value={c}>{HOLIDAY_COUNTRY_LABEL[c]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Late after
          <input type="number" min={0} max={MAX_GRACE_MINUTES} value={s.graceMinutes}
            onChange={(e) => setS({ ...s, graceMinutes: Number(e.target.value) })}
            className="w-16 rounded-lg border border-gray-300 px-2 py-1" />
          minutes
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {(!active || !initial) && (
          <button type="button" disabled={busy} onClick={() => void save(s)}
            className="rounded-lg bg-brand-600 px-4 py-1.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {initial ? 'Save' : isDefault ? 'Save as the company schedule' : `Give ${who} this schedule`}
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => setS(STANDARD_SCHEDULE)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50">
          Standard week (Mon–Fri, 7–4)
        </button>
        {initial && (
          <button type="button" disabled={busy} onClick={() => void save(null)}
            className="rounded-lg px-3 py-1.5 text-red-700 hover:bg-red-50">
            {isDefault ? 'Remove company schedule' : 'Use the company schedule instead'}
          </button>
        )}
      </div>
      {msg && <p className="text-green-700">{msg}</p>}
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}

// ── Break reminders ──────────────────────────────────────────────────────────

const COMPANY = '_company';

export function RemindersPanel({ version, onSaved }: { version: number; onSaved: () => void }) {
  const [data, setData] = useState<RemindersResponse | null>(null);
  const [target, setTarget] = useState(COMPANY);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setData(await fetchReminders()); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load reminders'); }
  }, []);
  useEffect(() => { void load(); }, [load, version]);

  if (!data) return <section className={card}><h2 className={h2}><Bi>Break reminders</Bi></h2><p className={lede}>{error || 'Loading…'}</p></section>;

  const isCompany = target === COMPANY;

  return (
    <section className={card}>
      <h2 className={h2}><Bi>Break reminders</Bi></h2>
      <p className={lede}>
        <Bi>A reminder in the corner of TTMS, and on the desktop where the browser allows it, with a button that clocks in
        or starts the break. Clock in is for people who have not clocked in yet that day; the others only for people who
        are clocked in and not already on a break. Only while TTMS is open. Times are office time (Guatemala). Change
        them for everybody, or for one person.</Bi>
      </p>

      <select value={target} onChange={(e) => setTarget(e.target.value)} className="mt-4 w-full rounded-lg border border-gray-300 py-1.5 pl-3 pr-8 text-sm">
        <option data-es value={COMPANY}>Company reminders (everyone without their own)</option>
        {data.people.map((p) => (
          <option key={p.email} value={p.email}>
            {p.name}{data.byEmail[p.email] ? ' — own reminders' : ''}{p.pending ? ' (not signed in yet)' : ''}
          </option>
        ))}
      </select>

      <RemindersEditor
        // Remounted after any save, so the boxes show what is stored now.
        key={`${target}|${version}`}
        company={data.company}
        own={isCompany ? null : data.byEmail[target] ?? {}}
        onSave={async (next) => {
          if (isCompany) await saveConfig({ reminders: next as BreakReminderSettings });
          else await saveReminderOverride(target, Object.keys(next).length > 0 ? next : null);
          onSaved();
        }}
      />
    </section>
  );
}

/**
 * `own` null edits the company's. Otherwise each kind either follows the
 * company or carries the person's own, starting from the company's values.
 */
function RemindersEditor({
  company, own, onSave,
}: {
  company: BreakReminderSettings;
  own: ReminderOverride | null;
  onSave: (next: ReminderOverride) => Promise<void>;
}) {
  const [values, setValues] = useState<BreakReminderSettings>(() => ({ ...company, ...(own ?? {}) }));
  const [custom, setCustom] = useState<Record<ReminderKind, boolean>>(() => ({
    clockIn: Boolean(own?.clockIn), break: Boolean(own?.break), lunch: Boolean(own?.lunch), activePause: Boolean(own?.activePause),
  }));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  // What was there when the editor opened, so the Save bar knows what changed.
  const [startKey] = useState(() => JSON.stringify({ values: { ...company, ...(own ?? {}) }, custom: {
    clockIn: Boolean(own?.clockIn), break: Boolean(own?.break), lunch: Boolean(own?.lunch), activePause: Boolean(own?.activePause),
  } }));
  const dirty = JSON.stringify({ values, custom }) !== startKey;
  const { active } = useSaveBarEntry({
    dirty,
    // The editor is remounted with the stored values after a save (see the
    // key in RemindersPanel), so there is nothing to put back here; Undo is
    // left to the change log for a set of reminders.
    save: async () => {
      const next: ReminderOverride = own === null
        ? values
        : Object.fromEntries(REMINDER_KINDS.filter((k) => custom[k]).map((k) => [k, values[k]]));
      await onSave(next);
    },
    discard: () => {
      const start = JSON.parse(startKey) as { values: BreakReminderSettings; custom: Record<ReminderKind, boolean> };
      setValues(start.values);
      setCustom(start.custom);
    },
  });

  async function save() {
    setBusy(true); setMsg(''); setError('');
    try {
      const next: ReminderOverride = own === null
        ? values
        : Object.fromEntries(REMINDER_KINDS.filter((k) => custom[k]).map((k) => [k, values[k]]));
      await onSave(next);
      setMsg('Saved. Open copies of TTMS pick it up the next time they load the clock.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  const set = <K extends ReminderKind>(kind: K, patch: Partial<BreakReminderSettings[K]>) =>
    setValues((v) => ({ ...v, [kind]: { ...v[kind], ...patch } }));

  return (
    <div className="mt-4 space-y-4 text-sm">
      <PreviewBox title="The day, with its reminders" note="Drag a reminder along the day to move it; its length stays the same. Nothing is saved until you press Save.">
        <ReminderTimeline
          values={values}
          editable={(k) => own === null || custom[k]}
          onMove={(kind, at, until) => setValues((v) => ({ ...v, [kind]: { ...v[kind], at, until } }))}
        />
      </PreviewBox>
      {REMINDER_KINDS.map((kind) => {
        const editable = own === null || custom[kind];
        const r = editable ? values[kind] : company[kind];
        return (
          <fieldset key={kind} className="rounded-lg border border-gray-200 p-3">
            <legend className="px-1 font-semibold text-gray-900">{REMINDER_LABEL[kind]}</legend>
            {own !== null && (
              <label className="mb-2 flex items-center gap-2 text-gray-600">
                <input type="checkbox" checked={!custom[kind]}
                  onChange={(e) => {
                    setCustom((c) => ({ ...c, [kind]: !e.target.checked }));
                    if (!e.target.checked) setValues((v) => ({ ...v, [kind]: company[kind] }));
                  }} />
                Same as the company
              </label>
            )}
            <div className={editable ? '' : 'opacity-50'}>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={r.enabled} disabled={!editable}
                  onChange={(e) => set(kind, { enabled: e.target.checked })} />
                {kind === 'activePause' ? 'Remind people to take an active pause' : 'Send this reminder'}
              </label>
              {kind !== 'clockIn' && <SlotFields kind={kind} r={r} disabled={!editable} onChange={(p) => set(kind, p)} />}
              {kind === 'clockIn' && (
                <>
                  <label className="mt-2 flex items-center gap-1.5">
                    Warn
                    <input type="number" min={MINUTES_LIMITS.clockIn.min} max={MINUTES_LIMITS.clockIn.max} value={r.minutes} disabled={!editable}
                      onChange={(e) => set(kind, { minutes: Number(e.target.value) })} className={numberBox} />
                    minutes before the shift starts (0 for no warning)
                  </label>
                  <p className="mt-2 text-xs text-gray-500">
                    <Bi>Follows each person&rsquo;s work schedule: a warning that many minutes before their shift, then a
                    reminder from the start of the shift until they clock in, dismiss it or the shift ends. Never on a
                    day off, a public holiday or a day of time off (pending requests too). With no schedule set, 7:00 to
                    4:00 on weekdays. Not recorded on anybody&rsquo;s attendance.</Bi>
                  </p>
                </>
              )}
              {kind === 'activePause' && (
                <p className="mt-2 text-xs text-gray-500">
                  <Bi>Once a day: three short desk exercises in English and Spanish, different every day. 8:30 sits in the
                  middle of the longest stretch without a break, 7 to 10. Not recorded on anybody&rsquo;s attendance.</Bi>
                </p>
              )}
              {kind !== 'clockIn' && <DaysField days={r.days} disabled={!editable} onChange={(days) => set(kind, { days })} />}
            </div>
          </fieldset>
        );
      })}
      {!active && (
        <button type="button" disabled={busy} onClick={() => void save()}
          className="rounded-lg bg-brand-600 px-4 py-1.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          Save
        </button>
      )}
      {msg && <p className="text-green-700">{msg}</p>}
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}

const numberBox = 'w-16 rounded-lg border border-gray-300 px-2 py-1';
const timeBox = 'rounded-lg border border-gray-300 px-2 py-1';

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const toHhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const TIMELINE_FROM = 6 * 60;
const TIMELINE_TO = 18 * 60;
const SLOT_COLOUR: Record<Exclude<ReminderKind, 'clockIn'>, string> = {
  break: 'bg-sky-400',
  lunch: 'bg-amber-400',
  activePause: 'bg-emerald-400',
};

/**
 * The working day from 6:00 to 18:00 with each reminder drawn where it
 * appears and for as long as it stays up. Dragging one moves its start and
 * end together, in five-minute steps — one change to the draft on release,
 * like the Calendar's week grid. Clock in is left off: it follows each
 * person's schedule, not a time set here.
 */
function ReminderTimeline({
  values, editable, onMove,
}: {
  values: BreakReminderSettings;
  editable: (kind: ReminderKind) => boolean;
  onMove: (kind: ReminderKind, at: string, until: string) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ kind: Exclude<ReminderKind, 'clockIn'>; startX: number; at: number; until: number; shift: number } | null>(null);
  const span = TIMELINE_TO - TIMELINE_FROM;
  const pct = (m: number) => `${((Math.min(Math.max(m, TIMELINE_FROM), TIMELINE_TO) - TIMELINE_FROM) / span) * 100}%`;
  const kinds = (['break', 'lunch', 'activePause'] as const).filter((k) => values[k].enabled);

  function onPointerMove(e: React.PointerEvent) {
    if (!drag || !track.current) return;
    const width = track.current.getBoundingClientRect().width;
    const raw = ((e.clientX - drag.startX) / width) * span;
    const shift = Math.round(raw / 5) * 5;
    const clamped = Math.max(TIMELINE_FROM - drag.at, Math.min(TIMELINE_TO - drag.until, shift));
    setDrag({ ...drag, shift: clamped });
  }
  function onPointerUp() {
    if (drag && drag.shift !== 0) onMove(drag.kind, toHhmm(drag.at + drag.shift), toHhmm(drag.until + drag.shift));
    setDrag(null);
  }

  return (
    <div onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp} className="select-none">
      <div ref={track} className="relative h-28 rounded-lg border border-gray-200 bg-white">
        {[7, 9, 11, 13, 15, 17].map((h) => (
          <div key={h} className="absolute inset-y-0 border-l border-dashed border-gray-100" style={{ left: pct(h * 60) }} />
        ))}
        {kinds.map((kind, i) => {
          const r = values[kind];
          const shift = drag?.kind === kind ? drag.shift : 0;
          const at = toMin(r.at) + shift;
          const until = toMin(r.until) + shift;
          const can = editable(kind);
          return (
            <div
              key={kind}
              role="slider"
              aria-label={`${REMINDER_LABEL[kind]}, ${toHhmm(at)} to ${toHhmm(until)}`}
              aria-valuenow={at}
              tabIndex={can ? 0 : -1}
              onKeyDown={(e) => {
                if (!can || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
                e.preventDefault();
                const d = e.key === 'ArrowLeft' ? -5 : 5;
                onMove(kind, toHhmm(toMin(r.at) + d), toHhmm(toMin(r.until) + d));
              }}
              onPointerDown={(e) => {
                if (!can) return;
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                setDrag({ kind, startX: e.clientX, at: toMin(r.at), until: toMin(r.until), shift: 0 });
              }}
              className={`absolute flex h-7 items-center overflow-hidden rounded-md px-2 text-[11px] font-semibold text-white shadow-sm ${SLOT_COLOUR[kind]} ${
                can ? 'cursor-grab active:cursor-grabbing' : 'opacity-60'
              } ${drag?.kind === kind ? 'ring-2 ring-brand-500' : ''}`}
              style={{ left: pct(at), width: `calc(${pct(until)} - ${pct(at)})`, top: `${10 + i * 32}px`, minWidth: '3.5rem' }}
            >
              <span className="truncate">{REMINDER_LABEL[kind]} {toHhmm(at)}</span>
            </div>
          );
        })}
        {kinds.length === 0 && <p data-es className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">No reminders are switched on.</p>}
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-gray-400">
        {['6:00', '9:00', '12:00', '15:00', '18:00'].map((t) => <span key={t}>{t}</span>)}
      </div>
    </div>
  );
}

function SlotFields({
  kind, r, disabled, onChange,
}: { kind: ReminderKind; r: SlotReminder; disabled: boolean; onChange: (p: Partial<SlotReminder>) => void }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
      <label className="flex items-center gap-1.5">
        At
        <input type="time" value={r.at} disabled={disabled} onChange={(e) => onChange({ at: e.target.value })} className={timeBox} />
      </label>
      <label className="flex items-center gap-1.5">
        {kind === 'break' ? 'to be taken by' : kind === 'lunch' ? 'until' : 'shown until'}
        <input type="time" value={r.until} disabled={disabled} onChange={(e) => onChange({ until: e.target.value })} className={timeBox} />
      </label>
      <label className="flex items-center gap-1.5">
        lasting
        <input type="number" min={MINUTES_LIMITS[kind].min} max={MINUTES_LIMITS[kind].max} value={r.minutes} disabled={disabled}
          onChange={(e) => onChange({ minutes: Number(e.target.value) })} className={numberBox} />
        minutes
      </label>
    </div>
  );
}

function DaysField({ days, disabled, onChange }: { days: WeekdayKey[]; disabled: boolean; onChange: (d: WeekdayKey[]) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {WEEKDAYS.map((d) => {
        const on = days.includes(d);
        return (
          <button key={d} type="button" disabled={disabled} aria-pressed={on}
            onClick={() => onChange(WEEKDAYS.filter((x) => (x === d ? !on : days.includes(x))))}
            className={`rounded-md border px-2 py-0.5 text-xs ${on ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
            {WEEKDAY_LABEL[d].slice(0, 3)}
          </button>
        );
      })}
    </div>
  );
}

// ── Holidays ─────────────────────────────────────────────────────────────────

export function HolidaysPanel() {
  const { formatDate } = useDateFormatters();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [overrides, setOverrides] = useState<HolidayOverride[] | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState('');
  const [adding, setAdding] = useState(false);
  const [add, setAdd] = useState<{ country: HolidayCountry; date: string; name: string }>({ country: 'GT', date: '', name: '' });
  const [error, setError] = useState('');
  const [view, setView] = useState<'calendar' | 'list'>('calendar');

  const load = useCallback(async () => {
    try { setOverrides((await fetchHolidayOverrides()).overrides); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Moves and cancellations need the calculated day as well as the observed
  // one, so the list is built from the rules and then marked up.
  const rows = useMemo(() => {
    if (!overrides) return [];
    const observed = observedHolidaysInYear(year, overrides);
    const cancelled = overrides
      .filter((o) => o.originalDate?.startsWith(`${year}-`) && !o.movedTo)
      .map((o) => ({ date: o.originalDate!, country: o.country, name: o.name, cancelled: true, overrideId: o.id }));
    return [...observed.map((h) => ({ ...h, cancelled: false })), ...cancelled]
      .sort((a, b) => a.date.localeCompare(b.date) || a.country.localeCompare(b.country));
  }, [overrides, year]);

  async function run(fn: () => Promise<unknown>) {
    setError('');
    try { await fn(); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'That did not work'); }
  }

  return (
    <section className={card}>
      <div className="flex items-center gap-3">
        <h2 className={`${h2} flex-1`}><Bi>Holidays</Bi></h2>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-lg border border-gray-300 py-1 pl-2 pr-7 text-sm">
          {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <p className={lede}>
        <Bi>Worked out from the law each year. Move one to the day the office actually closes, stop observing it, or add a
        company day off. The Celebrations calendar follows the same list.</Bi>
      </p>

      <div className="mt-3 flex rounded-lg border border-gray-200 p-0.5 text-xs w-fit" role="group" aria-label="View">
        {([['calendar', 'Year', CalendarDays], ['list', 'List', List]] as const).map(([id, text, Icon]) => (
          <button key={id} type="button" onClick={() => setView(id)} aria-pressed={view === id}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium ${view === id ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:bg-gray-50'}`}>
            <Icon size={13} /> <span data-es>{text}</span>
          </button>
        ))}
      </div>

      {view === 'calendar' && (
        <YearCalendar
          year={year}
          rows={rows}
          onPickDay={(date, holiday) => {
            if (holiday && !holiday.cancelled && !('added' in holiday && holiday.added)) {
              setMoving(`${holiday.country}|${holiday.date}|${holiday.name}`);
              setMoveTo(holiday.date);
              setView('list');
            } else if (!holiday) {
              setAdd({ country: 'GT', date, name: '' });
              setAdding(true);
            }
          }}
        />
      )}

      <ul className={`mt-3 divide-y divide-gray-100 text-sm ${view === 'list' ? '' : 'hidden'}`}>
        {rows.map((h) => {
          const key = `${h.country}|${h.date}|${h.name}`;
          const original = 'movedFrom' in h && h.movedFrom ? h.movedFrom : h.date;
          return (
            <li key={key} className="py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`w-28 flex-shrink-0 ${h.cancelled ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{formatDate(h.date)}</span>
                <span className="rounded bg-gray-100 px-1.5 text-xs text-gray-600">{h.country}</span>
                <span className={`min-w-0 flex-1 ${h.cancelled ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{h.name}</span>
                {'movedFrom' in h && h.movedFrom && <span className="text-xs text-amber-700">moved from {formatDate(h.movedFrom)}</span>}
                {'added' in h && h.added && <span className="text-xs text-blue-700">added</span>}
                {h.cancelled && <span className="text-xs text-gray-500">not observed</span>}
                <span className="flex gap-1">
                  {h.overrideId ? (
                    <button type="button" title="Undo this change" onClick={() => void run(() => deleteHolidayOverride(h.overrideId!))}
                      className="rounded p-1 text-gray-500 hover:bg-gray-100"><RotateCcw size={14} /></button>
                  ) : null}
                  {!h.cancelled && !('added' in h && h.added) && (
                    <>
                      <button type="button" onClick={() => { setMoving(key); setMoveTo(h.date); }}
                        className="rounded px-2 py-0.5 text-xs text-brand-600 hover:bg-brand-50">Move</button>
                      <button type="button"
                        onClick={() => void run(() => saveHolidayOverride({ country: h.country, originalDate: original, movedTo: null, name: h.name }))}
                        className="rounded px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100">Not observed</button>
                    </>
                  )}
                </span>
              </div>
              {moving === key && (
                <div className="mt-2 flex flex-wrap items-center gap-2 pl-28">
                  <DateField value={moveTo} onChange={setMoveTo} ariaLabel="New date" />
                  <button type="button"
                    onClick={() => void run(async () => {
                      await saveHolidayOverride({ country: h.country, originalDate: original, movedTo: moveTo, name: h.name });
                      setMoving(null);
                    })}
                    className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700">Move it</button>
                  <button type="button" onClick={() => setMoving(null)} className="text-xs text-gray-500">Cancel</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {adding ? (
        <div className="mt-3 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <select value={add.country} onChange={(e) => setAdd({ ...add, country: e.target.value as HolidayCountry })}
              className="rounded-lg border border-gray-300 py-1.5 pl-2 pr-7">
              {(Object.keys(HOLIDAY_COUNTRY_LABEL) as HolidayCountry[]).map((c) => <option key={c} value={c}>{HOLIDAY_COUNTRY_LABEL[c]}</option>)}
            </select>
            <DateField value={add.date} onChange={(date) => setAdd({ ...add, date })} ariaLabel="Date" />
          </div>
          <input value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} maxLength={100}
            placeholder="What it is — e.g. Company anniversary" className="w-full rounded-lg border border-gray-300 px-3 py-1.5" />
          <div className="flex gap-2">
            <button type="button" disabled={!add.date || !add.name.trim()}
              onClick={() => void run(async () => {
                await saveHolidayOverride({ country: add.country, originalDate: null, movedTo: add.date, name: add.name.trim() });
                setAdding(false); setAdd({ country: 'GT', date: '', name: '' });
              })}
              className="rounded-lg bg-brand-600 px-3 py-1.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-50">Add</button>
            <button type="button" onClick={() => setAdding(false)} className="rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100">Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-3 text-sm font-medium text-brand-600 hover:underline">Add a day off</button>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}

/**
 * The year as twelve small months, holidays marked by country. Clicking a
 * holiday opens its Move in the list; clicking any other day starts adding a
 * company day off on it. Nothing is saved by a click — the Add and Move it
 * buttons do that, as before.
 */
function YearCalendar({
  year, rows, onPickDay,
}: {
  year: number;
  rows: { date: string; country: HolidayCountry; name: string; cancelled: boolean }[];
  onPickDay: (date: string, holiday: (typeof rows)[number] | null) => void;
}) {
  const byDate = new Map<string, (typeof rows)[number][]>();
  for (const r of rows) if (!r.cancelled) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
  const months = Array.from({ length: 12 }, (_, m) => m);
  const pad = (n: number) => String(n).padStart(2, '0');
  const monthName = (m: number) => new Date(year, m, 1).toLocaleString('en-US', { month: 'long' });

  return (
    <div className="mt-3">
      <div className="mb-2 flex gap-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-rose-400" /> Guatemala</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-blue-500" /> United States</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {months.map((m) => {
          const first = new Date(year, m, 1).getDay();
          const days = new Date(year, m + 1, 0).getDate();
          return (
            <div key={m} className="rounded-lg border border-gray-100 p-2">
              <p className="mb-1 text-xs font-semibold text-gray-700">{monthName(m)}</p>
              <div className="grid grid-cols-7 gap-px text-center text-[10px]">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} className="text-gray-300">{d}</span>)}
                {Array.from({ length: first }, (_, i) => <span key={`b${i}`} />)}
                {Array.from({ length: days }, (_, i) => {
                  const date = `${year}-${pad(m + 1)}-${pad(i + 1)}`;
                  const hs = byDate.get(date) ?? [];
                  const colour = hs.some((h) => h.country === 'GT') && hs.some((h) => h.country === 'US')
                    ? 'bg-gradient-to-br from-rose-400 to-blue-500 text-white'
                    : hs.some((h) => h.country === 'GT') ? 'bg-rose-400 text-white'
                    : hs.length ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100';
                  return (
                    <button key={date} type="button" title={hs.map((h) => `${h.name} (${h.country})`).join(', ') || 'Add a day off'}
                      onClick={() => onPickDay(date, hs[0] ?? null)}
                      className={`aspect-square rounded tabular-nums leading-none transition ${colour}`}>
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-gray-500"><Bi>Click a holiday to move it, or any other day to add a company day off there.</Bi></p>
    </div>
  );
}

// ── Lunch times ──────────────────────────────────────────────────────────────

/** "1:00 PM" from "13:00" — the box shows 24-hour, the list reads easier this way. */
function clock12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * Move lunch for everybody, one person or several at once. Lunch is the
 * `lunch` slot of the break reminders, so this is a quicker way to the same
 * setting: what it saves shows in Break reminders below, and "Back on time"
 * ends lunch by its end.
 */
export function LunchTimesPanel({ version, onSaved }: { version: number; onSaved: () => void }) {
  const [data, setData] = useState<RemindersResponse | null>(null);
  const [mode, setMode] = useState<'everyone' | 'people'>('everyone');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [at, setAt] = useState('');
  const [until, setUntil] = useState('');
  const [resetOwn, setResetOwn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchReminders()
      .then((r) => {
        setData(r);
        // Start from the company's lunch the first time, never over what HR is typing.
        setAt((v) => v || r.company.lunch.at);
        setUntil((v) => v || r.company.lunch.until);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load lunch times'));
  }, [version]);

  if (!data) return <section className={card}><h2 className={h2}><Bi>Lunch times</Bi></h2><p className={lede}>{error || 'Loading…'}</p></section>;

  const lunchOf = (email: string) => data.byEmail[email]?.lunch ?? null;
  const ownCount = data.people.filter((p) => lunchOf(p.email)).length;
  const q = filter.trim().toLowerCase();
  const shown = data.people.filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.includes(q));
  const toggle = (email: string) =>
    setChosen((s) => { const n = new Set(s); if (n.has(email)) n.delete(email); else n.add(email); return n; });

  async function save() {
    setBusy(true); setMsg(''); setError('');
    try {
      if (mode === 'everyone') {
        const r = await moveLunch({ target: 'everyone', at, until, resetOwn });
        setMsg(`Moved the company lunch to ${clock12(at)}–${clock12(until)}${r.reset ? `, and ${r.reset} ${r.reset === 1 ? 'person' : 'people'} back onto it` : ''}.`);
      } else {
        const r = await moveLunch({ target: 'people', emails: [...chosen], at, until });
        setMsg(`Moved lunch to ${clock12(at)}–${clock12(until)} for ${r.moved} ${r.moved === 1 ? 'person' : 'people'}.`);
        setChosen(new Set());
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={card}>
      <h2 className={h2}><Bi>Lunch times</Bi></h2>
      <p className={lede}>
        Move lunch for everybody, or for several people at once. Lunch ends at the end time even if somebody leaves
        late, and &ldquo;Back on time&rdquo; uses it too. Company lunch now: {clock12(data.company.lunch.at)}–{clock12(data.company.lunch.until)}.
      </p>

      <div className="mt-3 flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name="lunch-mode" checked={mode === 'everyone'} onChange={() => setMode('everyone')} />
          Everyone
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="lunch-mode" checked={mode === 'people'} onChange={() => setMode('people')} />
          Chosen people
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        New lunch
        <input type="time" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Lunch starts" className={timeBox} />
        to
        <input type="time" value={until} onChange={(e) => setUntil(e.target.value)} aria-label="Lunch ends" className={timeBox} />
      </div>

      {mode === 'everyone' ? (
        <label className={`mt-3 flex items-start gap-2 text-sm ${ownCount ? '' : 'opacity-50'}`}>
          <input type="checkbox" className="mt-0.5" checked={resetOwn} disabled={!ownCount} onChange={(e) => setResetOwn(e.target.checked)} />
          <span>
            Also move the {ownCount} {ownCount === 1 ? 'person' : 'people'} with a lunch time of their own
            <span data-es className="block text-xs text-gray-500">Otherwise they keep their own time.</span>
          </span>
        </label>
      ) : (
        <div className="mt-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a person"
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5" />
            <button type="button" onClick={() => setChosen(new Set([...chosen, ...shown.map((p) => p.email)]))}
              className="rounded-lg px-2 py-1 text-brand-600 hover:bg-brand-50">Select all shown</button>
            <button type="button" onClick={() => setChosen(new Set())} disabled={chosen.size === 0}
              className="rounded-lg px-2 py-1 text-gray-600 hover:bg-gray-100 disabled:opacity-50">Clear</button>
          </div>
          <ul className="mt-2 max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
            {shown.map((p) => {
              const own = lunchOf(p.email);
              return (
                <li key={p.email}>
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-gray-50">
                    <input type="checkbox" checked={chosen.has(p.email)} onChange={() => toggle(p.email)} />
                    <span className="min-w-0 flex-1 truncate text-gray-900">{p.name}{p.pending ? ' (not signed in yet)' : ''}</span>
                    <span className="text-xs text-gray-500">
                      {own ? `${clock12(own.at)}–${clock12(own.until)}` : 'Company lunch'}
                    </span>
                  </label>
                </li>
              );
            })}
            {shown.length === 0 && <li data-es className="px-3 py-3 text-center text-gray-500">Nobody matches.</li>}
          </ul>
          <p className="mt-1 text-xs text-gray-500">{chosen.size} chosen. Each gets a lunch time of their own; their other reminders stay as they are.</p>
        </div>
      )}

      <WhoMoves
        people={mode === 'everyone'
          ? data.people.filter((p) => resetOwn || !lunchOf(p.email))
          : data.people.filter((p) => chosen.has(p.email))}
        at={at}
        until={until}
      />

      <button type="button" onClick={() => void save()}
        disabled={busy || !at || !until || (mode === 'people' && chosen.size === 0)}
        className="mt-3 rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
        {mode === 'everyone'
          ? 'Move everyone’s lunch'
          : chosen.size === 0 ? 'Move lunch for the chosen people'
          : `Move lunch for ${chosen.size} ${chosen.size === 1 ? 'person' : 'people'}`}
      </button>
      {msg && <p className="mt-2 text-sm text-green-700">{msg}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}

/** The faces of whoever a lunch move reaches — initials, with the name on hover. */
function WhoMoves({ people, at, until }: { people: { email: string; name: string }[]; at: string; until: string }) {
  if (!at || !until) return null;
  const shown = people.slice(0, 30);
  const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <PreviewBox className="mt-3" title="Who moves">
      {people.length === 0 ? (
        <p className="text-sm text-gray-500"><Bi>Nobody yet. Choose the people to move.</Bi></p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {shown.map((p) => (
              <span key={p.email} title={p.name}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-800">
                {initials(p.name)}
              </span>
            ))}
            {people.length > shown.length && <span className="self-center text-xs text-gray-500">+{people.length - shown.length}</span>}
          </div>
          <p className="mt-2 text-sm text-gray-700">
            {people.length} {people.length === 1 ? 'person goes' : 'people go'} to lunch at {clock12(at)}–{clock12(until)}.
          </p>
        </>
      )}
    </PreviewBox>
  );
}

// ── Back on time ─────────────────────────────────────────────────────────────

/** Company-wide only, unlike the reminders above: it is one switch and one number. */
export function BackOnTimePanel() {
  const [stored, setStored] = useState<BackOnTimeSettings | null>(null);
  const [value, setValue] = useState<BackOnTimeSettings | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetchConfig()
      .then((r) => { setStored(r.config.backOnTime); setValue(r.config.backOnTime); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load'));
  }, []);

  const writeOut = async (next: BackOnTimeSettings) => {
    const saved = (await saveConfig({ backOnTime: next })).config.backOnTime;
    setStored(saved);
    setValue(saved);
  };
  const { active } = useSaveBarEntry({
    dirty: Boolean(value && stored) && JSON.stringify(value) !== JSON.stringify(stored),
    save: async () => {
      const previous = stored!;
      await writeOut(value!);
      return async () => { await writeOut(previous); };
    },
    discard: () => setValue(stored),
  });

  // Outside Settings (Attendance → Setup) a change still saves as it is made.
  async function save(next: BackOnTimeSettings) {
    if (active) { setValue(next); return; }
    setError(''); setMsg('');
    try {
      await writeOut(next);
      setMsg('Saved. Open copies of TTMS pick it up the next time they load the clock.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    }
  }

  if (!value) return <section className={card}><h2 className={h2}><Bi>Back on time</Bi></h2><p className={lede}>{error || 'Loading…'}</p></section>;

  const leads = [];
  for (let n = BACK_ON_TIME_LEAD.min; n <= BACK_ON_TIME_LEAD.max; n++) leads.push(n);

  return (
    <section className={card}>
      <h2 className={h2}><Bi>Back on time</Bi></h2>
      <p className={lede}>
        <Bi>A few minutes before somebody&rsquo;s break or lunch ends, a reminder asks if they are back. If they are, one
        click ends the break at the time it was due to end, not earlier, so they do not lose minutes or forget to
        clock back in. A break ends its length after it started (from the break reminders above). Lunch ends at the
        end of the person&rsquo;s lunch time — 2:00 if lunch is 1 to 2 — even if they went out late. They can undo it until that
        time, and the day shows HR when the button was pressed. Only while TTMS is open.</Bi>
      </p>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value.enabled} onChange={(e) => void save({ ...value, enabled: e.target.checked })} />
        Offer &ldquo;Back on time&rdquo;
      </label>
      <label className={`mt-2 flex items-center gap-2 text-sm ${value.enabled ? '' : 'opacity-50'}`}>
        Show it
        <select value={value.leadMinutes} disabled={!value.enabled}
          onChange={(e) => void save({ ...value, leadMinutes: Number(e.target.value) })}
          className="rounded-lg border border-gray-300 py-1 pl-2 pr-8">
          {leads.map((n) => <option key={n} value={n}>{n} minutes</option>)}
        </select>
        before the break ends
      </label>
      {msg && <p className="mt-2 text-sm text-green-700">{msg}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}

// ── Networks and alerts ──────────────────────────────────────────────────────

export function NetworkPanel() {
  const [config, setConfig] = useState<AttendanceConfig | null>(null);
  const [alertDraft, setAlertDraft] = useState<{ alerts: boolean; alertAfterMinutes: number } | null>(null);
  const [yourIp, setYourIp] = useState<string | null>(null);
  const [ip, setIp] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetchConfig()
      .then((r) => { setConfig(r.config); setAlertDraft({ alerts: r.config.alerts, alertAfterMinutes: r.config.alertAfterMinutes }); setYourIp(r.yourIp); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load'));
  }, []);

  async function save(patch: Partial<AttendanceConfig>) {
    setError(''); setMsg('');
    try {
      setConfig((await saveConfig(patch)).config);
      setMsg('Saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    }
  }

  // The two alert settings are a draft for the Save bar; adding or removing a
  // network is a one-press action, as it always was.
  const alertsDirty = Boolean(config && alertDraft)
    && (alertDraft!.alerts !== config!.alerts || alertDraft!.alertAfterMinutes !== config!.alertAfterMinutes);
  const { active } = useSaveBarEntry({
    dirty: alertsDirty,
    problem: alertDraft && (alertDraft.alertAfterMinutes < 5 || alertDraft.alertAfterMinutes > 240)
      ? 'The alert delay must be between 5 and 240 minutes.' : undefined,
    save: async () => {
      const previous = { alerts: config!.alerts, alertAfterMinutes: config!.alertAfterMinutes };
      const next = (await saveConfig(alertDraft!)).config;
      setConfig(next);
      return async () => {
        const back = (await saveConfig(previous)).config;
        setConfig(back);
        setAlertDraft(previous);
      };
    },
    discard: () => config && setAlertDraft({ alerts: config.alerts, alertAfterMinutes: config.alertAfterMinutes }),
  });

  if (!config) return <section className={card}><h2 className={h2}><Bi>Office network</Bi></h2><p className={lede}>{error || 'Loading…'}</p></section>;

  const addNetwork = (address: string, name: string) =>
    void save({ officeNetworks: [...config.officeNetworks, { ip: address.trim(), label: name.trim() }] }).then(() => { setIp(''); setLabel(''); });

  return (
    <section className={card}>
      <h2 className={h2}><Bi>Office network and alerts</Bi></h2>
      <p className={lede}>
        <Bi>A clock-in from one of these internet addresses is marked as from the office. This only works if the office
        has a fixed address — your internet provider can confirm it.</Bi>
      </p>

      <ul className="mt-3 divide-y divide-gray-100 text-sm">
        {config.officeNetworks.map((n) => (
          <li key={n.ip} className="flex items-center gap-2 py-2">
            <span className="font-mono text-gray-900">{n.ip}</span>
            <span className="flex-1 text-gray-500">{n.label}</span>
            <button type="button" aria-label={`Remove ${n.ip}`}
              onClick={() => void save({ officeNetworks: config.officeNetworks.filter((x) => x.ip !== n.ip) })}
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
          </li>
        ))}
        {config.officeNetworks.length === 0 && <li className="py-2 text-gray-500">None yet — nothing is marked as from the office.</li>}
      </ul>

      {yourIp && !config.officeNetworks.some((n) => n.ip === yourIp) && (
        <button type="button" onClick={() => addNetwork(yourIp, 'Office')}
          className="mt-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100">
          I am in the office — add this network ({yourIp})
        </button>
      )}
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="IP address" className="w-40 rounded-lg border border-gray-300 px-3 py-1.5 font-mono" />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label, e.g. Zona 10 office" maxLength={60} className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5" />
        <button type="button" disabled={!ip.trim()} onClick={() => addNetwork(ip, label)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50 disabled:opacity-50">Add</button>
      </div>

      <div className="mt-5 border-t border-gray-100 pt-4 text-sm">
        <h3 className="font-semibold text-gray-900">&ldquo;Not in yet&rdquo; alerts</h3>
        <p className="mt-1 text-gray-500">
          <Bi>A message in the Attendance alerts chat room for HR, administrators and the person&rsquo;s team lead, when
          somebody scheduled has not clocked in or used TTMS. Checked every 15 minutes, 6am to 6pm, Monday to Saturday.</Bi>
        </p>
        {active && alertDraft ? (
          <>
            <label className="mt-3 flex items-center gap-2">
              <input type="checkbox" checked={alertDraft.alerts} onChange={(e) => setAlertDraft({ ...alertDraft, alerts: e.target.checked })} />
              Send alerts
            </label>
            <label className="mt-2 flex items-center gap-2">
              After
              <input type="number" min={5} max={240} value={alertDraft.alertAfterMinutes}
                onChange={(e) => setAlertDraft({ ...alertDraft, alertAfterMinutes: Number(e.target.value) })}
                className="w-16 rounded-lg border border-gray-300 px-2 py-1" />
              minutes past their start (after their grace minutes)
            </label>
          </>
        ) : (
          <>
            <label className="mt-3 flex items-center gap-2">
              <input type="checkbox" checked={config.alerts} onChange={(e) => void save({ alerts: e.target.checked })} />
              Send alerts
            </label>
            <label className="mt-2 flex items-center gap-2">
              After
              <input type="number" min={5} max={240} defaultValue={config.alertAfterMinutes}
                onBlur={(e) => { const n = Number(e.target.value); if (n !== config.alertAfterMinutes) void save({ alertAfterMinutes: n }); }}
                className="w-16 rounded-lg border border-gray-300 px-2 py-1" />
              minutes past their start (after their grace minutes)
            </label>
          </>
        )}
      </div>

      {msg && <p className="mt-2 text-sm text-green-700">{msg}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
