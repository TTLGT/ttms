'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { fetchTeamNumbers, saveStandingTargets, type TeamNumbers as TeamNumbersReply } from '@/lib/salesDay';
import { UserAvatar } from '@/components/settings/UserAvatar';
import { TargetSteppers } from '@/components/planner/SalesTargets';
import { Bi } from '@/components/spanish/Es';
import {
  DEFAULT_SALES_TARGETS, SALES_METRICS, SALES_METRIC_LABEL, isTappedMetric, targetsMet,
  type SalesDay, type SalesPerson, type SalesTargets,
} from '@/types/salesDay';

/**
 * Team plans → Numbers: each broker's targets and how the day went — see
 * src/types/salesDay.ts. A Sales Manager sees their own team, `sales.viewAll`
 * (admins) everybody; the route decides, and this draws what it answered,
 * narrowed by the team and name filters above it (`onlyUids`).
 *
 * "Set targets" changes the person's standing targets — every day from now,
 * unless they change one day's in the planning pop-up. Offered only where
 * the route says the viewer may.
 */
export default function TeamNumbers({ date, onlyUids }: { date: string; onlyUids: Set<string> | null }) {
  const [data, setData] = useState<TeamNumbersReply | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<SalesPerson | null>(null);

  const load = useCallback(async () => {
    setError('');
    try { setData(await fetchTeamNumbers(date)); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load the numbers.'); }
  }, [date]);
  useEffect(() => { void load(); }, [load]);

  if (error) return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</p>;
  if (!data) {
    return <div className="flex justify-center py-12"><div className="h-7 w-7 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" /></div>;
  }

  const byUid = new Map(data.days.map((d) => [d.uid, d]));
  const people = data.people.filter((p) => !onlyUids || onlyUids.has(p.uid));
  if (!people.length) {
    return <p className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500"><Bi>No brokers to show.</Bi></p>;
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-3 py-2 font-semibold" data-es>Person</th>
              {SALES_METRICS.map((m) => (
                <th key={m} className="px-3 py-2 font-semibold" data-es>{SALES_METRIC_LABEL[m]}</th>
              ))}
              <th className="px-3 py-2 font-semibold" data-es>Met</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {people.map((p) => {
              const day = byUid.get(p.uid);
              return (
                <tr key={p.uid}>
                  <td className="px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <UserAvatar photoPath={p.photoPath} fallback={p.name.charAt(0).toUpperCase()} size={26} name={p.name} />
                      <span className="truncate font-medium text-gray-900">{p.name}</span>
                    </div>
                  </td>
                  {SALES_METRICS.map((m) => <Cell key={m} day={day} metric={m} />)}
                  <td className="px-3 py-2 text-xs font-semibold text-gray-700">
                    {day ? (() => { const t = targetsMet(day); return `${t.met} of ${t.set}`; })() : '—'}
                    {day?.adjusted && <span className="block font-normal text-gray-400" data-es>changed for today</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {p.canSetTargets && (
                      <button type="button" onClick={() => setEditing(p)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
                        <Pencil size={12} /> Set targets
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        <Bi>Calls, emails and referrals are what each broker tapped; quotes and new clients TTMS counts by itself. Only the broker, their Sales Manager and admins see these.</Bi>
      </p>
      {editing && (
        <TargetsDialog
          person={editing}
          day={byUid.get(editing.uid) ?? null}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
    </>
  );
}

function Cell({ day, metric }: { day: SalesDay | undefined; metric: (typeof SALES_METRICS)[number] }) {
  if (!day) return <td className="px-3 py-2 text-gray-400">—</td>;
  const target = day.targets[metric];
  const done = day.done[metric];
  const met = target > 0 && done >= target;
  return (
    <td className="px-3 py-2 tabular-nums">
      <span className={`font-semibold ${met ? 'text-green-700' : 'text-gray-900'}`}>{done}</span>
      <span className="text-gray-400"> / {target}</span>
      {!isTappedMetric(metric) && <span className="ml-1 text-[10px] text-gray-400" title="Counted by TTMS">auto</span>}
    </td>
  );
}

function TargetsDialog({ person, day, onClose, onSaved }: {
  person: SalesPerson; day: SalesDay | null; onClose: () => void; onSaved: () => void;
}) {
  // From the standing targets, not today's: the broker may have changed today's.
  const [value, setValue] = useState<SalesTargets>(day?.standing ?? DEFAULT_SALES_TARGETS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true); setError('');
    try { await saveStandingTargets(person.uid, value); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={`Targets for ${person.name}`}>
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
          <h3 className="flex-1 text-base font-semibold text-gray-900">Targets for {person.name}</h3>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="px-4 py-3">
          <p className="mb-2 text-sm text-gray-600">
            <Bi>Every working day from now on. They can change one day’s in the planning pop-up; these stay as they are.</Bi>
          </p>
          {day && <TargetSteppers day={day} value={value} onChange={setValue} />}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
          <button type="button" onClick={save} disabled={busy}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {busy ? 'Saving…' : 'Save targets'}
          </button>
        </div>
      </div>
    </div>
  );
}
