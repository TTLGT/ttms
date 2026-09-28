'use client';

import { useCallback, useEffect, useState } from 'react';
import DateField from '@/components/DateField';
import {
  decideCorrection,
  decideTimeOff,
  fetchCorrections,
  fetchTimeOff,
  requestTimeOff,
} from '@/lib/attendance';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  TIME_OFF_KINDS,
  TIME_OFF_LABEL,
  type CorrectionRequest,
  type ReportPerson,
  type RequestStatus,
  type TimeOffKind,
  type TimeOffRequest,
} from '@/types/attendance';

/**
 * Time off and corrections waiting on HR, and a way to record time off for
 * somebody who phoned it in (idea 8 and 19). `attendance.manage` only — the
 * routes refuse anybody else.
 *
 * Nobody decides their own: the routes refuse it, and the buttons are not
 * drawn, so HR's own requests wait for an administrator.
 */

const STATUS_STYLE: Record<RequestStatus, string> = {
  pending:   'bg-amber-50 text-amber-800',
  approved:  'bg-green-50 text-green-800',
  refused:   'bg-red-50 text-red-700',
  withdrawn: 'bg-gray-100 text-gray-600',
};

export default function RequestsPanel({
  people, myEmail, onChanged,
}: {
  people: ReportPerson[];
  myEmail: string;
  onChanged: () => void;
}) {
  const { formatDate, formatDateRange } = useDateFormatters();
  const [timeOff, setTimeOff] = useState<TimeOffRequest[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRequest[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([fetchTimeOff('all'), fetchCorrections('all')]);
      setTimeOff(t.requests);
      setCorrections(c.requests);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load requests');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function decide(kind: 'timeOff' | 'correction', id: string, decision: 'approve' | 'refuse') {
    const note = decision === 'refuse' ? window.prompt('Why not? (shown to them)') ?? null : '';
    if (note === null) return;
    setBusy(id);
    setError('');
    try {
      if (kind === 'timeOff') await decideTimeOff(id, decision, note);
      else await decideCorrection(id, decision, note);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work');
    } finally {
      setBusy('');
    }
  }

  // Waiting first, then the most recent — the queue is the point of the screen.
  const byQueue = <T extends { status: RequestStatus; createdAt: number }>(list: T[]) =>
    [...list].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || b.createdAt - a.createdAt);

  return (
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900">Time off</h2>
        <RecordTimeOff people={people.filter((p) => p.email !== myEmail)} onSaved={() => { void load(); onChanged(); }} />
        <ul className="mt-4 divide-y divide-gray-100">
          {byQueue(timeOff).map((r) => (
            <li key={r.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-gray-900">{r.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                <span className="text-gray-600">{TIME_OFF_LABEL[r.kind]} · {formatDateRange(r.from, r.to)}</span>
              </div>
              {r.note && <p className="mt-1 text-gray-600">{r.note}</p>}
              {r.enteredByEmail && <p className="mt-1 text-xs text-gray-500">Recorded by {r.decidedByName ?? r.enteredByEmail}</p>}
              {r.status !== 'pending' && !r.enteredByEmail && r.decidedByName && (
                <p className="mt-1 text-xs text-gray-500">
                  {r.status === 'withdrawn' ? 'Withdrawn' : `${r.status === 'approved' ? 'Approved' : 'Refused'} by ${r.decidedByName}`}
                  {r.decidedAt ? `, ${formatDate(new Date(r.decidedAt))}` : ''}{r.decisionNote ? ` — ${r.decisionNote}` : ''}
                </p>
              )}
              {r.status === 'pending' && r.email !== myEmail && (
                <Decide busy={busy === r.id} onDecide={(d) => void decide('timeOff', r.id, d)} />
              )}
            </li>
          ))}
          {timeOff.length === 0 && <li className="py-6 text-center text-sm text-gray-500">No time off in the last year.</li>}
        </ul>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900">Corrections</h2>
        <p className="mt-1 text-sm text-gray-500">
          Somebody asking for a clock time to be changed. Approving rewrites the day and keeps the original beside it.
        </p>
        <ul className="mt-4 divide-y divide-gray-100">
          {byQueue(corrections).map((r) => (
            <li key={r.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-gray-900">{r.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                <span className="text-gray-600">
                  {formatDate(r.date)} · {r.clockIn ? `in ${r.clockIn}` : ''}{r.clockIn && r.clockOut ? ', ' : ''}{r.clockOut ? `out ${r.clockOut}` : ''}
                </span>
              </div>
              <p className="mt-1 text-gray-600">{r.reason}</p>
              {r.status !== 'pending' && r.decidedByName && (
                <p className="mt-1 text-xs text-gray-500">
                  {r.status === 'approved' ? 'Approved' : r.status === 'refused' ? 'Refused' : 'Withdrawn'} by {r.decidedByName}
                  {r.decisionNote ? ` — ${r.decisionNote}` : ''}
                </p>
              )}
              {r.status === 'pending' && r.email !== myEmail && (
                <Decide busy={busy === r.id} onDecide={(d) => void decide('correction', r.id, d)} />
              )}
            </li>
          ))}
          {corrections.length === 0 && <li className="py-6 text-center text-sm text-gray-500">No corrections asked for.</li>}
        </ul>
      </section>

      {error && <p className="text-sm text-red-600 xl:col-span-2">{error}</p>}
    </div>
  );
}

function Decide({ busy, onDecide }: { busy: boolean; onDecide: (d: 'approve' | 'refuse') => void }) {
  return (
    <div className="mt-2 flex gap-2">
      <button type="button" disabled={busy} onClick={() => onDecide('approve')}
        className="rounded-lg bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">
        Approve
      </button>
      <button type="button" disabled={busy} onClick={() => onDecide('refuse')}
        className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
        Refuse
      </button>
    </div>
  );
}

/** HR recording time off for somebody — approved as it is saved. */
function RecordTimeOff({ people, onSaved }: { people: ReportPerson[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [kind, setKind] = useState<TimeOffKind>('sick');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-sm font-medium text-brand-600 hover:underline">
        Record time off for someone
      </button>
    );
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      await requestTimeOff({ email, from, to: to || from, kind, note });
      setOpen(false);
      setEmail(''); setFrom(''); setTo(''); setNote('');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
      <select value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-gray-300 py-1.5 pl-3 pr-8">
        <option value="">Who?</option>
        {people.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <DateField value={from} onChange={setFrom} ariaLabel="First day" />
        <DateField value={to} onChange={setTo} ariaLabel="Last day" />
      </div>
      <select value={kind} onChange={(e) => setKind(e.target.value as TimeOffKind)} className="w-full rounded-lg border border-gray-300 py-1.5 pl-3 pr-8">
        {TIME_OFF_KINDS.map((k) => <option key={k} value={k}>{TIME_OFF_LABEL[k]}</option>)}
      </select>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" maxLength={500}
        className="w-full rounded-lg border border-gray-300 px-3 py-1.5" />
      <div className="flex gap-2">
        <button type="button" onClick={() => void save()} disabled={busy || !email || !from}
          className="rounded-lg bg-brand-600 px-3 py-1.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          Save
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100">Cancel</button>
      </div>
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}
