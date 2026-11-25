'use client';

import { useEffect, useRef, useState } from 'react';
import { Minus, Phone, Plus, Target, X } from 'lucide-react';
import { useMySalesDay, useTap } from '@/lib/salesDay';
import { Bi } from '@/components/spanish/Es';
import {
  SALES_METRICS, SALES_METRIC_HOW, SALES_METRIC_LABEL, TAPPED_METRICS, isTappedMetric, targetsMet,
  type SalesDay, type SalesMetric, type SalesTargets,
} from '@/types/salesDay';

/*
 * A broker's daily numbers on screen — see src/types/salesDay.ts. Three
 * shapes of the same answer, all kept in step by useMySalesDay():
 *
 *  - `SalesTargetsCard`: the card on Planner → Today, and inside the
 *    close-of-day pop-up, where a miscount is fixed before the day closes.
 *  - `SalesCounter`: the pill at the foot of every page, so a call made from
 *    Orders or a client's page counts without leaving it.
 *  - `TargetSteppers`: the targets step of "Plan my whole day".
 *
 * Nothing is drawn for anybody without numbers (`day` null).
 */

function Bar({ value, target }: { value: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const met = target > 0 && value >= target;
  return (
    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-200">
      <div className={`h-full rounded-full ${met ? 'bg-green-600' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function SalesTargetsCard({ compact = false }: { compact?: boolean }) {
  const { day } = useMySalesDay();
  const { tap, busy, error } = useTap();
  if (!day) return null;
  const { met, set } = targetsMet(day);
  return (
    <section data-tour={compact ? undefined : 'targets'} className={`rounded-xl border border-gray-200 bg-white ${compact ? 'mt-4 p-3' : 'p-4'}`}>
      <div className="mb-2 flex items-center gap-2">
        <Target size={16} className="text-amber-600" />
        <h3 className="flex-1 text-base font-semibold text-gray-900"><Bi>Today’s targets</Bi></h3>
        <span className={`text-xs font-semibold ${met === set && set > 0 ? 'text-green-700' : 'text-gray-500'}`}>{met} of {set} met</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {SALES_METRICS.map((m) => (
          <li key={m} className="py-2">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800" data-es>{SALES_METRIC_LABEL[m]}</p>
                <p className="text-[11px] text-gray-500" data-es>{SALES_METRIC_HOW[m]}</p>
              </div>
              <span className="tabular-nums text-sm font-bold text-gray-900">
                {day.done[m]}<span className="font-normal text-gray-400"> / {day.targets[m]}</span>
              </span>
              {isTappedMetric(m) && (
                <span className="flex gap-1">
                  <button type="button" aria-label={`One less: ${SALES_METRIC_LABEL[m]}`} disabled={busy === m || day.done[m] === 0}
                    onClick={() => tap(m, -1)}
                    className="rounded-md border border-gray-300 p-1 text-gray-500 hover:bg-gray-50 disabled:opacity-30">
                    <Minus size={12} />
                  </button>
                  <button type="button" aria-label={`One more: ${SALES_METRIC_LABEL[m]}`} disabled={busy === m}
                    onClick={() => tap(m, 1)}
                    className="rounded-md bg-brand-600 px-2 py-1 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50">
                    +1
                  </button>
                </span>
              )}
            </div>
            <Bar value={day.done[m]} target={day.targets[m]} />
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {!compact && (
        <p className="mt-2 text-[11px] text-gray-500">
          <Bi>Your Sales Manager and admins see these numbers. Targets are a starting point your team lead sets; change today’s in the planning pop-up.</Bi>
        </p>
      )}
    </section>
  );
}

/** The pill at the foot of every page, for people who sell. */
export function SalesCounter() {
  const { day } = useMySalesDay();
  const { tap, busy } = useTap();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc); };
  }, [open]);

  if (!day) return null;
  return (
    <div ref={box} className="fixed bottom-4 left-4 z-40 lg:left-64" data-learn-skip>
      {open && (
        <div className="mb-2 w-60 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center">
            <p className="flex-1 text-xs font-bold uppercase tracking-wider text-gray-500" data-es>Today</p>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={14} /></button>
          </div>
          <div className="grid gap-1.5">
            {TAPPED_METRICS.map((m) => (
              <button key={m} type="button" disabled={busy === m} onClick={() => tap(m, 1)}
                className="flex items-center justify-between rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                <span>+1 <span data-es>{SALES_METRIC_LABEL[m]}</span></span>
                <span className="tabular-nums opacity-80">{day.done[m]}/{day.targets[m]}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-gray-500"><Bi>Quotes and new clients count themselves.</Bi></p>
        </div>
      )}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        title="Today’s calls, emails and referrals"
        className="inline-flex items-center gap-1.5 rounded-full bg-brand-800 px-3 py-1.5 text-xs font-bold text-white shadow-lg ring-4 ring-brand-100 hover:bg-brand-700">
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        <Phone size={12} />
        <span className="tabular-nums">Calls {day.done.calls}/{day.targets.calls}</span>
      </button>
    </div>
  );
}

/** The targets step of "Plan my whole day": today's numbers, changed for today only. */
export function TargetSteppers({ day, value, onChange }: {
  day: SalesDay;
  value: SalesTargets;
  onChange: (t: SalesTargets) => void;
}) {
  const step = (m: SalesMetric, d: number) => onChange({ ...value, [m]: Math.max(0, Math.min(500, value[m] + d)) });
  return (
    <ul className="divide-y divide-gray-100">
      {SALES_METRICS.map((m) => (
        <li key={m} className="flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900" data-es>{SALES_METRIC_LABEL[m]}</p>
            <p className="text-xs text-gray-500" data-es>{SALES_METRIC_HOW[m]}</p>
          </div>
          {!isTappedMetric(m) && <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-bold text-green-700">{day.done[m]} so far</span>}
          <span className="inline-flex items-center overflow-hidden rounded-lg border border-gray-300">
            <button type="button" aria-label="Less" onClick={() => step(m, -1)} className="bg-gray-50 px-2.5 py-1 text-gray-700 hover:bg-gray-100"><Minus size={13} /></button>
            <span className="min-w-[2.75rem] text-center text-base font-bold tabular-nums text-gray-900">{value[m]}</span>
            <button type="button" aria-label="More" onClick={() => step(m, 1)} className="bg-gray-50 px-2.5 py-1 text-gray-700 hover:bg-gray-100"><Plus size={13} /></button>
          </span>
        </li>
      ))}
    </ul>
  );
}
