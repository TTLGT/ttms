'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import DateField from '@/components/DateField';
import {
  deleteHolidayOverride,
  fetchConfig,
  fetchHolidayOverrides,
  fetchReminders,
  fetchSchedules,
  saveConfig,
  saveHolidayOverride,
  saveReminderOverride,
  saveSchedule,
  type RemindersResponse,
  type SchedulesResponse,
} from '@/lib/attendance';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  DEFAULT_SCHEDULE_ID,
  MAX_GRACE_MINUTES,
  STANDARD_SCHEDULE,
  WEEKDAYS,
  WEEKDAY_LABEL,
  type AttendanceConfig,
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
  return (
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <SchedulesPanel />
      <div className="space-y-6">
        <HolidaysPanel />
        <RemindersPanel />
        <NetworkPanel />
      </div>
    </div>
  );
}

const card = 'rounded-xl border border-gray-200 bg-white p-5';
const h2 = 'text-sm font-semibold uppercase tracking-wide text-gray-900';
const lede = 'mt-1 text-sm text-gray-500';

// ── Schedules ────────────────────────────────────────────────────────────────

function SchedulesPanel() {
  const [data, setData] = useState<SchedulesResponse | null>(null);
  const [target, setTarget] = useState(DEFAULT_SCHEDULE_ID);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setData(await fetchSchedules()); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load schedules'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!data) return <section className={card}><h2 className={h2}>Schedules</h2><p className={lede}>{error || 'Loading…'}</p></section>;

  const own = target === DEFAULT_SCHEDULE_ID ? data.fallback : data.byEmail[target] ?? null;
  const personName = data.people.find((p) => p.email === target)?.name;

  return (
    <section className={card}>
      <h2 className={h2}>Schedules</h2>
      <p className={lede}>
        When each person is expected in, in office time. Anybody without a schedule of their own follows the company
        one. Nobody is ever marked late or absent without one — until the company schedule is saved, nobody is.
      </p>

      <select value={target} onChange={(e) => setTarget(e.target.value)} className="mt-4 w-full rounded-lg border border-gray-300 py-1.5 pl-3 pr-8 text-sm">
        <option value={DEFAULT_SCHEDULE_ID}>Company schedule (everyone without their own)</option>
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
  const [s, setS] = useState<Schedule>(initial ?? fallback ?? STANDARD_SCHEDULE);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

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
                  ) : <span className="text-gray-400">Day off</span>}
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
        <button type="button" disabled={busy} onClick={() => void save(s)}
          className="rounded-lg bg-brand-600 px-4 py-1.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          Save
        </button>
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

function RemindersPanel() {
  const [data, setData] = useState<RemindersResponse | null>(null);
  const [target, setTarget] = useState(COMPANY);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setData(await fetchReminders()); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load reminders'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!data) return <section className={card}><h2 className={h2}>Break reminders</h2><p className={lede}>{error || 'Loading…'}</p></section>;

  const isCompany = target === COMPANY;

  return (
    <section className={card}>
      <h2 className={h2}>Break reminders</h2>
      <p className={lede}>
        A reminder in the corner of TTMS, and on the desktop where the browser allows it, with a button that clocks in
        or starts the break. Clock in is for people who have not clocked in yet that day; the others only for people who
        are clocked in and not already on a break. Only while TTMS is open. Times are office time (Guatemala). Change
        them for everybody, or for one person.
      </p>

      <select value={target} onChange={(e) => setTarget(e.target.value)} className="mt-4 w-full rounded-lg border border-gray-300 py-1.5 pl-3 pr-8 text-sm">
        <option value={COMPANY}>Company reminders (everyone without their own)</option>
        {data.people.map((p) => (
          <option key={p.email} value={p.email}>
            {p.name}{data.byEmail[p.email] ? ' — own reminders' : ''}{p.pending ? ' (not signed in yet)' : ''}
          </option>
        ))}
      </select>

      <RemindersEditor
        key={target}
        company={data.company}
        own={isCompany ? null : data.byEmail[target] ?? {}}
        onSave={async (next) => {
          if (isCompany) await saveConfig({ reminders: next as BreakReminderSettings });
          else await saveReminderOverride(target, Object.keys(next).length > 0 ? next : null);
          await load();
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
                <p className="mt-2 text-xs text-gray-500">
                  Follows each person&rsquo;s work schedule: shown from the start of their shift until they clock in,
                  dismiss it or the shift ends. Never on a day off, a public holiday or a day of time off (pending
                  requests too). With no schedule set, 7:00 to 4:00 on weekdays. Not recorded on anybody&rsquo;s
                  attendance.
                </p>
              )}
              {kind === 'activePause' && (
                <p className="mt-2 text-xs text-gray-500">
                  Once a day: three short desk exercises in English and Spanish, different every day. 8:30 sits in the
                  middle of the longest stretch without a break, 7 to 10. Not recorded on anybody&rsquo;s attendance.
                </p>
              )}
              {kind !== 'clockIn' && <DaysField days={r.days} disabled={!editable} onChange={(days) => set(kind, { days })} />}
            </div>
          </fieldset>
        );
      })}
      <button type="button" disabled={busy} onClick={() => void save()}
        className="rounded-lg bg-brand-600 px-4 py-1.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
        Save
      </button>
      {msg && <p className="text-green-700">{msg}</p>}
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}

const numberBox = 'w-16 rounded-lg border border-gray-300 px-2 py-1';
const timeBox = 'rounded-lg border border-gray-300 px-2 py-1';

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

function HolidaysPanel() {
  const { formatDate } = useDateFormatters();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [overrides, setOverrides] = useState<HolidayOverride[] | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState('');
  const [adding, setAdding] = useState(false);
  const [add, setAdd] = useState<{ country: HolidayCountry; date: string; name: string }>({ country: 'GT', date: '', name: '' });
  const [error, setError] = useState('');

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
        <h2 className={`${h2} flex-1`}>Holidays</h2>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-lg border border-gray-300 py-1 pl-2 pr-7 text-sm">
          {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <p className={lede}>
        Worked out from the law each year. Move one to the day the office actually closes, stop observing it, or add a
        company day off. The Celebrations calendar follows the same list.
      </p>

      <ul className="mt-3 divide-y divide-gray-100 text-sm">
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

// ── Networks and alerts ──────────────────────────────────────────────────────

function NetworkPanel() {
  const [config, setConfig] = useState<AttendanceConfig | null>(null);
  const [yourIp, setYourIp] = useState<string | null>(null);
  const [ip, setIp] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetchConfig()
      .then((r) => { setConfig(r.config); setYourIp(r.yourIp); })
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

  if (!config) return <section className={card}><h2 className={h2}>Office network</h2><p className={lede}>{error || 'Loading…'}</p></section>;

  const addNetwork = (address: string, name: string) =>
    void save({ officeNetworks: [...config.officeNetworks, { ip: address.trim(), label: name.trim() }] }).then(() => { setIp(''); setLabel(''); });

  return (
    <section className={card}>
      <h2 className={h2}>Office network and alerts</h2>
      <p className={lede}>
        A clock-in from one of these internet addresses is marked as from the office. This only works if the office
        has a fixed address — your internet provider can confirm it.
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
          A message in the Attendance alerts chat room for HR, administrators and the person&rsquo;s team lead, when
          somebody scheduled has not clocked in or used TTMS. Checked every 15 minutes, 6am to 6pm, Monday to Saturday.
        </p>
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
      </div>

      {msg && <p className="mt-2 text-sm text-green-700">{msg}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
