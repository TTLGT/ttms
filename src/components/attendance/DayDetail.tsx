'use client';

import { useEffect, useState } from 'react';
import { Building2, Globe, Laptop, X } from 'lucide-react';
import { editDay, fetchDay, requestCorrection } from '@/lib/attendance';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  ACTIVITY_KINDS,
  ACTIVITY_LABEL,
  BREAK_LABEL,
  OUTCOME_LABEL,
  TIME_OFF_LABEL,
  deviceLabel,
  formatMinutes,
  officeClock,
  officeHhmm,
  placeLabel,
  type AttendanceDay,
  type ClockDetails,
  type DaySummary,
} from '@/types/attendance';
import { dayFlags } from './outcomeStyle';

/**
 * One person's day, in full, over the page.
 *
 * Shared by the Attendance grid and the profile page. What it offers depends
 * on who is looking: somebody with `attendance.manage` can change the times
 * (with a reason, kept forever); the person themselves can ask for a
 * correction. Somebody who is both — HR looking at their own day — asks, like
 * anyone else: nobody approves a change to their own hours.
 */

/**
 * Office time, not the viewer's: the schedule and the time boxes below are
 * office time, and somebody in HR reading from another timezone would
 * otherwise see "late at 9:05" beside a clock-in drawn as 10:05.
 */
const clockTime = (ms: number | null | undefined) => (ms ? officeClock(ms) : '—');

/** Seeds the time boxes. Office time, because that is what the server reads them as. */
const hhmm = (ms: number | null) => (ms ? officeHhmm(ms) : '');

export default function DayDetail({
  email, name, date, summary, mine, canEdit, onClose, onChanged,
}: {
  email: string;
  name: string;
  date: string;
  summary: DaySummary;
  /** The viewer's own day: they may ask for a correction. */
  mine: boolean;
  /** `attendance.manage`, and not their own day. */
  canEdit: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { formatDate } = useDateFormatters();
  const [day, setDay] = useState<AttendanceDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const [clockIn, setClockIn] = useState(hhmm(summary.clockIn));
  const [clockOut, setClockOut] = useState(hhmm(summary.clockOut));
  const [reason, setReason] = useState('');

  useEffect(() => {
    fetchDay(email, date)
      .then((r) => setDay(r.day))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the day'))
      .finally(() => setLoading(false));
  }, [email, date]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit() {
    setBusy(true);
    setError('');
    setDone('');
    const input = {
      date,
      clockIn: clockIn || null,
      clockOut: clockOut || null,
      reason: reason.trim(),
    };
    try {
      if (canEdit) {
        const res = await editDay({ email, ...input });
        setDay(res.day);
        setDone('Changed. The original times are kept below.');
      } else {
        await requestCorrection(input);
        setDone('Sent to HR. You will see their answer on your profile page.');
      }
      setReason('');
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work');
    } finally {
      setBusy(false);
    }
  }

  const flags = dayFlags(summary);
  const activity = ACTIVITY_KINDS.filter((k) => (day?.activity?.[k] ?? 0) > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${name}, ${formatDate(date)}`}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 flex items-start gap-3 border-b border-gray-100 bg-white px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-gray-900">{name}</h2>
            <p className="text-sm text-gray-500">{formatDate(date)} · {OUTCOME_LABEL[summary.outcome] || 'Coming up'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100">
            <X size={18} />
          </button>
        </header>

        <div className="space-y-5 px-5 py-4 text-sm">
          {/* The verdict first: it is what anybody opening a day came to find out. */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Row label="Scheduled">{summary.shift ? `${summary.shift.start} – ${summary.shift.end}` : 'Not scheduled'}</Row>
            <Row label="Clocked in">{clockTime(summary.clockIn)}</Row>
            <Row label="Clocked out">{clockTime(summary.clockOut)}{summary.missedClockOut ? ' (closed by TTMS)' : ''}</Row>
            <Row label="Worked">{summary.clockIn ? formatMinutes(summary.workedMinutes) : '—'}</Row>
            <Row label="Breaks">{summary.breakMinutes ? formatMinutes(summary.breakMinutes) : '—'}</Row>
            <Row label="Active / idle">{`${formatMinutes(summary.activeMinutes)} / ${formatMinutes(summary.idleMinutes)}`}</Row>
            {summary.holiday && <Row label="Holiday">{summary.holiday}</Row>}
            {summary.timeOff && <Row label="Time off">{TIME_OFF_LABEL[summary.timeOff]}</Row>}
          </dl>

          {flags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {flags.map((f) => (
                <span key={f} className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">{f}</span>
              ))}
            </div>
          )}

          {loading ? (
            <p className="text-gray-500">Loading…</p>
          ) : day && day.sessions.length > 0 ? (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Clock record</h3>
              <ul className="space-y-2">
                {day.sessions.flatMap((s, i) => [
                  <ClockLine key={`in${i}`} label="In" d={s.in} />,
                  ...(s.out ? [<ClockLine key={`out${i}`} label="Out" d={s.out} />] : []),
                ])}
              </ul>
              {day.breaks.length > 0 && (
                <ul className="mt-2 space-y-1 text-gray-600">
                  {day.breaks.map((b, i) => (
                    <li key={i}>{BREAK_LABEL[b.kind]}: {clockTime(b.start)} – {b.end ? clockTime(b.end) : 'still on it'}</li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {activity.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Work</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                {activity.map((k) => <Row key={k} label={ACTIVITY_LABEL[k]}>{day!.activity[k]}</Row>)}
              </dl>
            </section>
          )}

          {(day?.corrections?.length ?? 0) > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Changes to this day</h3>
              <ul className="space-y-2">
                {day!.corrections!.map((c, i) => (
                  <li key={i} className="rounded-lg bg-gray-50 px-3 py-2 text-gray-700">
                    <p>
                      {clockTime(c.before.clockIn)}–{clockTime(c.before.clockOut)} → {clockTime(c.after.clockIn)}–{clockTime(c.after.clockOut)}
                    </p>
                    <p className="text-xs text-gray-500">By {c.byName}, {formatDate(new Date(c.at))}: {c.reason}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(canEdit || mine) && summary.outcome !== 'upcoming' && (
            <section className="border-t border-gray-100 pt-4">
              <h3 className="text-sm font-semibold text-gray-900">{canEdit ? 'Change the times' : 'Ask for a correction'}</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Office time. Leave a box empty to keep that time as it is. A clock-out earlier than the clock-in counts as after midnight.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="text-xs text-gray-600">
                  Clock in
                  <input type="time" value={clockIn} onChange={(e) => setClockIn(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                </label>
                <label className="text-xs text-gray-600">
                  Clock out
                  <input type="time" value={clockOut} onChange={(e) => setClockOut(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                </label>
              </div>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder={canEdit ? 'Why (kept with the change)' : 'What happened — for example, “Forgot to clock out, left at 6pm”'}
                className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || !reason.trim()}
                className="mt-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
              >
                {canEdit ? 'Save change' : 'Send to HR'}
              </button>
            </section>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {done && <p className="text-sm text-green-700">{done}</p>}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-900">{children}</dd>
    </>
  );
}

function ClockLine({ label, d }: { label: string; d: ClockDetails }) {
  const place = placeLabel(d);
  return (
    <li className="rounded-lg border border-gray-100 px-3 py-2">
      <p className="font-medium text-gray-900">
        {label} at {clockTime(d.at)}
        {d.manual === 'correction' && <span className="ml-2 text-xs font-normal text-amber-700">changed by HR</span>}
        {d.manual === 'autoClose' && <span className="ml-2 text-xs font-normal text-amber-700">closed by TTMS</span>}
      </p>
      {!d.manual && (
        <div className="mt-1 space-y-0.5 text-xs text-gray-600">
          <p className="flex items-center gap-1.5">
            <Building2 size={12} className="flex-shrink-0" />
            {d.office ? 'Office network' : 'Not the office network'}
          </p>
          <p className="flex items-center gap-1.5">
            <Globe size={12} className="flex-shrink-0" />
            {d.ip ?? 'No address'}
            {place && <> · network location {place}</>}
            {d.provider && <> · {d.provider}</>}
          </p>
          <p className="flex items-center gap-1.5">
            <Laptop size={12} className="flex-shrink-0" />
            {deviceLabel(d.device)}
            {d.newDevice && <span className="rounded bg-amber-50 px-1.5 text-amber-800">new device</span>}
          </p>
        </div>
      )}
    </li>
  );
}
