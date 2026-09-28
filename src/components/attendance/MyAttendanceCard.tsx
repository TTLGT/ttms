'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import DateField from '@/components/DateField';
import { useAttendance } from '@/context/AttendanceContext';
import {
  decideCorrection,
  decideTimeOff,
  fetchCorrections,
  fetchReport,
  fetchTimeOff,
  requestTimeOff,
} from '@/lib/attendance';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  OUTCOME_LABEL,
  TIME_OFF_KINDS,
  TIME_OFF_LABEL,
  addDays,
  datesBetween,
  formatMinutes,
  officeDateOf,
  weekdayOf,
  type AttendanceReport,
  type CorrectionRequest,
  type TimeOffKind,
  type TimeOffRequest,
} from '@/types/attendance';
import AttendancePolicy from './AttendancePolicy';
import DayDetail from './DayDetail';
import { OUTCOME_STYLE, cellClass, dayFlags } from './outcomeStyle';

/**
 * A person's own attendance on their profile page (ideas 8, 19, 20): their
 * month, their time off, their corrections, and whether colleagues see their
 * last seen.
 *
 * Everything here is the caller's own, and the routes take the email off the
 * ID token — there is no parameter that could make this show somebody else.
 */

const STATUS_WORD = { pending: 'Waiting', approved: 'Approved', refused: 'Refused', withdrawn: 'Withdrawn' } as const;

export default function MyAttendanceCard({ email }: { email: string }) {
  const { formatDate, formatDateRange } = useDateFormatters();
  const { state, setHideLastSeen, busy } = useAttendance();
  const today = officeDateOf(Date.now());
  const [month, setMonth] = useState(today.slice(0, 7));
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [timeOff, setTimeOff] = useState<TimeOffRequest[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRequest[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState('');

  const from = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const to = addDays(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`, -1);

  const load = useCallback(async () => {
    try {
      const [r, t, c] = await Promise.all([fetchReport(from, to, 'self'), fetchTimeOff('self'), fetchCorrections('self')]);
      setReport(r);
      setTimeOff(t.requests);
      setCorrections(c.requests);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your attendance');
    }
  }, [from, to]);
  useEffect(() => { void load(); }, [load]);

  const step = (by: number) => {
    const n = m + by;
    const next = n < 1 ? `${y - 1}-12` : n > 12 ? `${y + 1}-01` : `${y}-${String(n).padStart(2, '0')}`;
    setMonth(next);
  };

  const cells = report?.cells[email] ?? {};
  const dates = datesBetween(from, to);
  const worked = Object.values(cells).reduce((sum, s) => sum + s.workedMinutes, 0);
  const late = Object.values(cells).filter((s) => s.lateMinutes > 0).length;
  // Monday-first, with blanks before the 1st so the columns are weekdays.
  const lead = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(weekdayOf(from));

  return (
    <section className="mt-5 space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white">
        <header className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
          <h2 className="flex-1 text-xs font-semibold uppercase tracking-wide text-gray-500">My attendance</h2>
          <button type="button" onClick={() => step(-1)} aria-label="Previous month" className="rounded p-1 text-gray-500 hover:bg-gray-200"><ChevronLeft size={16} /></button>
          <span className="min-w-[7rem] text-center text-sm font-medium text-gray-800">{new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span>
          <button type="button" onClick={() => step(1)} aria-label="Next month" className="rounded p-1 text-gray-500 hover:bg-gray-200"><ChevronRight size={16} /></button>
        </header>
        <div className="p-4">
          <p className="mb-3 text-sm text-gray-600">
            {formatMinutes(worked)} worked this month{late ? ` · late ${late} ${late === 1 ? 'time' : 'times'}` : ''}. Click a day for the details, or to ask for a correction.
          </p>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-gray-500">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i}>{d}</div>)}
            {Array.from({ length: lead }, (_, i) => <div key={`b${i}`} />)}
            {dates.map((date) => {
              const s = cells[date];
              if (!s) return <div key={date} />;
              const title = [OUTCOME_LABEL[s.outcome], s.holiday, ...dayFlags(s)].filter(Boolean).join(' · ');
              return (
                <button key={date} type="button" title={title}
                  disabled={s.outcome === 'upcoming' || (s.outcome === 'off' && !s.clockIn)}
                  onClick={() => setOpen(date)}
                  className={`flex h-10 flex-col items-center justify-center rounded border text-xs ${cellClass(s)} ${date === today ? 'ring-2 ring-brand-400' : ''}`}>
                  <span className="font-semibold">{Number(date.slice(8))}</span>
                  <span className="text-[10px] leading-none">{OUTCOME_STYLE[s.outcome].short}</span>
                </button>
              );
            })}
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      </div>

      <TimeOffBox
        requests={timeOff}
        onChanged={() => void load()}
        formatRange={formatDateRange}
      />

      {corrections.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white">
          <header className="border-b border-gray-100 bg-gray-50 px-4 py-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">My corrections</h2>
          </header>
          <ul className="divide-y divide-gray-100 px-4 text-sm">
            {corrections.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-2.5">
                <span className="text-gray-900">{formatDate(c.date)}</span>
                <span className="text-gray-600">{[c.clockIn && `in ${c.clockIn}`, c.clockOut && `out ${c.clockOut}`].filter(Boolean).join(', ')}</span>
                <span className="flex-1 text-xs text-gray-500">{STATUS_WORD[c.status]}{c.decisionNote ? ` — ${c.decisionNote}` : ''}</span>
                {c.status === 'pending' && (
                  <button type="button" onClick={() => void decideCorrection(c.id, 'withdraw').then(load)}
                    className="text-xs text-gray-600 hover:underline">Withdraw</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state && (
        <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm">
          <input type="checkbox" className="mt-0.5" checked={state.hideLastSeen} disabled={busy}
            onChange={(e) => void setHideLastSeen(e.target.checked)} />
          <span>
            <span className="font-medium text-gray-900">Hide when I was last seen</span>
            <span className="mt-0.5 block text-gray-500">
              Colleagues will not see Online, Away or Last seen for you in chat — only a status you set yourself. HR still sees your attendance.
            </span>
          </span>
        </label>
      )}

      <AttendancePolicy />

      {open && cells[open] && (
        <DayDetail
          email={email}
          name="Your day"
          date={open}
          summary={cells[open]}
          mine
          canEdit={false}
          onClose={() => setOpen(null)}
          onChanged={() => void load()}
        />
      )}
    </section>
  );
}

function TimeOffBox({
  requests, onChanged, formatRange,
}: {
  requests: TimeOffRequest[];
  onChanged: () => void;
  formatRange: (a: string, b: string) => string;
}) {
  const [asking, setAsking] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [kind, setKind] = useState<TimeOffKind>('vacation');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    setBusy(true);
    setError('');
    try {
      await requestTimeOff({ from, to: to || from, kind, note });
      setAsking(false); setFrom(''); setTo(''); setNote('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send');
    } finally {
      setBusy(false);
    }
  }

  const today = officeDateOf(Date.now());

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <header className="flex items-center border-b border-gray-100 bg-gray-50 px-4 py-2.5">
        <h2 className="flex-1 text-xs font-semibold uppercase tracking-wide text-gray-500">My time off</h2>
        {!asking && (
          <button type="button" onClick={() => setAsking(true)} className="text-sm font-medium text-brand-600 hover:underline">Ask for time off</button>
        )}
      </header>
      {asking && (
        <div className="space-y-2 border-b border-gray-100 p-4 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-gray-600">First day<DateField value={from} onChange={setFrom} ariaLabel="First day" /></label>
            <label className="text-xs text-gray-600">Last day<DateField value={to} onChange={setTo} ariaLabel="Last day" /></label>
          </div>
          <select value={kind} onChange={(e) => setKind(e.target.value as TimeOffKind)} className="w-full rounded-lg border border-gray-300 py-1.5 pl-3 pr-8">
            {TIME_OFF_KINDS.map((k) => <option key={k} value={k}>{TIME_OFF_LABEL[k]}</option>)}
          </select>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Anything HR should know (optional)"
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5" />
          <div className="flex gap-2">
            <button type="button" onClick={() => void send()} disabled={busy || !from}
              className="rounded-lg bg-brand-600 px-3 py-1.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-50">Send to HR</button>
            <button type="button" onClick={() => setAsking(false)} className="rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100">Cancel</button>
          </div>
          {error && <p className="text-red-600">{error}</p>}
        </div>
      )}
      <ul className="divide-y divide-gray-100 px-4 text-sm">
        {requests.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 py-2.5">
            <span className="text-gray-900">{formatRange(r.from, r.to)}</span>
            <span className="text-gray-600">{TIME_OFF_LABEL[r.kind]}</span>
            <span className="flex-1 text-xs text-gray-500">{STATUS_WORD[r.status]}{r.decisionNote ? ` — ${r.decisionNote}` : ''}</span>
            {(r.status === 'pending' || (r.status === 'approved' && r.from > today)) && (
              <button type="button" onClick={() => void decideTimeOff(r.id, 'withdraw').then(onChanged)}
                className="text-xs text-gray-600 hover:underline">Withdraw</button>
            )}
          </li>
        ))}
        {requests.length === 0 && !asking && <li className="py-4 text-center text-gray-500">None yet.</li>}
      </ul>
    </div>
  );
}
