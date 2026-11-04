'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Share2, X } from 'lucide-react';
import { relativeDay } from '@/types/planning';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { DAY_PLAN_SHARED_EVENT } from '@/types/dayPlan';

/**
 * Says so, wherever the tick happened, when finishing a planning slot shared
 * a day's plan with the person's manager (src/types/dayPlan.ts). Sharing is
 * a side effect of ticking a box, so it must never happen silently: this is
 * what makes it the person's own act rather than something done to them.
 */
export default function DayPlanSharedNotice() {
  const { formatCalendarDate } = useDateFormatters();
  const [date, setDate] = useState<string | null>(null);

  useEffect(() => {
    const on = (e: Event) => setDate(String((e as CustomEvent).detail ?? ''));
    window.addEventListener(DAY_PLAN_SHARED_EVENT, on);
    return () => window.removeEventListener(DAY_PLAN_SHARED_EVENT, on);
  }, []);

  useEffect(() => {
    if (!date) return;
    const t = setTimeout(() => setDate(null), 9000);
    return () => clearTimeout(t);
  }, [date]);

  if (!date) return null;
  const when = relativeDay(date)?.toLowerCase() ?? formatCalendarDate(date);
  return (
    <div role="status" className="fixed bottom-4 left-1/2 z-50 flex w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 items-start gap-2 rounded-xl border border-green-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-lg">
      <Share2 size={16} className="mt-0.5 shrink-0 text-green-600" />
      <p className="flex-1">
        Your plan for {when} is shared with your manager — names and times only.{' '}
        <Link href="/dashboard/calendar" className="text-brand-700 hover:underline">See what was shared</Link>
      </p>
      <button type="button" onClick={() => setDate(null)} aria-label="Dismiss" className="text-gray-400 hover:text-gray-700">
        <X size={14} />
      </button>
    </div>
  );
}
