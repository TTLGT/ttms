'use client';

import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, RefreshCw, Share2 } from 'lucide-react';
import { fetchMyPlans, shareMyPlan, type MyPlansReply } from '@/lib/dayPlans';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { formatTime } from '@/types/task';
import { relativeDay } from '@/types/planning';
import { DAY_PLAN_DISCLOSURE, DAY_PLAN_SHARED_EVENT, type DayPlan } from '@/types/dayPlan';

/**
 * The Calendar side panel that shows somebody exactly what their manager can
 * see of their plan — today's and the next working day's — and lets them
 * share again or mark an item Busy. See src/types/dayPlan.ts.
 *
 * Everybody gets it, managers included: it is the disclosure as much as a
 * control, and it must be on the page of the person whose plan is shared.
 */
export default function MySharedPlanPanel() {
  const { formatCalendarDate, formatDateTime } = useDateFormatters();
  const [data, setData] = useState<MyPlansReply | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setData(await fetchMyPlans()); } catch { setData(null); }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(DAY_PLAN_SHARED_EVENT, load);
    return () => window.removeEventListener(DAY_PLAN_SHARED_EVENT, load);
  }, [load]);

  async function share(date: string, busyIds?: string[]) {
    setBusy(date);
    setError('');
    try {
      const plan = await shareMyPlan(date, busyIds);
      setData((d) => (d ? { ...d, plans: { ...d.plans, [date]: plan } } : d));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not share it. Try again.');
    } finally {
      setBusy('');
    }
  }

  if (!data) return null;

  const day = (date: string, plan: DayPlan | null) => (
    <div key={date} className="rounded-lg border border-gray-100 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-800">{relativeDay(date) ?? formatCalendarDate(date)}</p>
        <button type="button" disabled={!!busy} onClick={() => share(date, plan?.busyIds)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50">
          {plan ? <RefreshCw size={12} className={busy === date ? 'animate-spin' : ''} /> : <Share2 size={12} />}
          {plan ? 'Share again' : 'Share now'}
        </button>
      </div>
      <p className="text-xs text-gray-500">
        {plan
          ? `Shared ${formatDateTime(plan.sharedAt)} · ${plan.items.length} item${plan.items.length === 1 ? '' : 's'}`
          : 'Not shared yet — it is when you finish that day’s planning.'}
      </p>
      {plan && plan.items.length > 0 && (
        <ul className="mt-2 space-y-1">
          {plan.items.map((item) => {
            const hidden = plan.busyIds.includes(item.id);
            const next = hidden ? plan.busyIds.filter((x) => x !== item.id) : [...plan.busyIds, item.id];
            return (
              <li key={item.id} className="flex items-center gap-2 text-xs">
                <span className="w-16 shrink-0 tabular-nums text-gray-500">{item.start ? formatTime(item.start) : 'Any time'}</span>
                <span className={`min-w-0 flex-1 truncate ${hidden ? 'italic text-gray-400' : 'text-gray-700'}`}>{item.title}</span>
                <button type="button" disabled={!!busy} onClick={() => share(date, next)}
                  title={hidden ? 'Show the name again' : 'Show as Busy — the time stays, the name is hidden'}
                  aria-label={hidden ? 'Show the name again' : 'Show as Busy'}
                  className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50">
                  {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <Share2 size={15} className="text-brand-600" /> My shared plan
      </h2>
      <p className="mt-1 text-xs text-gray-500">{DAY_PLAN_DISCLOSURE}</p>
      <div className="mt-3 space-y-2">
        {day(data.today, data.plans[data.today] ?? null)}
        {day(data.next, data.plans[data.next] ?? null)}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <p className="mt-2 text-[11px] text-gray-400">
        Share again after changing your plan — what is shared is a copy, and does not follow your edits.
      </p>
    </section>
  );
}
