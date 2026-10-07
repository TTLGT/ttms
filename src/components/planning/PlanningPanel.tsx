'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, CalendarClock } from 'lucide-react';
import { getMyPlanning, setMyPlanningPrompt } from '@/lib/planning';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { formatTime, repeatText } from '@/types/task';
import {
  PLANNING_ASK_EVENT,
  PLANNING_CHANGED_EVENT,
  PLANNING_COPY,
  relativeDay,
  type PlanningStatus,
} from '@/types/planning';

/**
 * The Calendar page's side panel for planning slots: which are on the
 * calendar, and the way back from "Don't ask again" — which would otherwise
 * be a door with no handle on this side.
 *
 * It changes only whether the card asks. A slot already on the calendar is a
 * task, moved or deleted from the task itself.
 */
export default function PlanningPanel() {
  const { formatCalendarDate } = useDateFormatters();
  const [kinds, setKinds] = useState<PlanningStatus[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setKinds(await getMyPlanning()); } catch { setKinds([]); }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(PLANNING_CHANGED_EVENT, load);
    return () => window.removeEventListener(PLANNING_CHANGED_EVENT, load);
  }, [load]);

  async function askNow(k: PlanningStatus) {
    setBusy(true);
    try {
      await setMyPlanningPrompt(k.kind, 'on');
      window.dispatchEvent(new CustomEvent(PLANNING_ASK_EVENT, { detail: k.kind }));
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function stopAsking(k: PlanningStatus) {
    setBusy(true);
    try {
      await setMyPlanningPrompt(k.kind, 'off');
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!kinds?.length) return null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <CalendarClock size={15} className="text-brand-600" /> Planning time
      </h2>
      <p className="mt-1 text-xs text-gray-500">
        Set times to look over today, plan tomorrow, next week and next month, with a reminder when each comes round.
      </p>
      <ul className="mt-3 space-y-2.5">
        {kinds.map((k) => (
          <li key={k.kind} className="flex items-start justify-between gap-2 text-sm">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-medium text-gray-800">
                {k.scheduled && <CalendarCheck size={13} className="text-green-600" />}
                {PLANNING_COPY[k.kind].label}
              </p>
              <p className="text-xs text-gray-500">
                {k.scheduled
                  ? `${k.scheduled.repeat === 'none'
                    ? (k.scheduled.date ? relativeDay(k.scheduled.date) ?? formatCalendarDate(k.scheduled.date) : '')
                    : repeatText(k.scheduled)}${k.scheduled.time
                    ? `, ${formatTime(k.scheduled.time)}${k.scheduled.endTime ? ` – ${formatTime(k.scheduled.endTime)}` : ''}`
                    : ''}`
                  : k.off ? 'Not on your calendar. Not asking.' : 'Not on your calendar yet.'}
              </p>
            </div>
            {!k.scheduled && (
              <div className="flex flex-shrink-0 flex-col items-end gap-1">
                <button type="button" disabled={busy} onClick={() => askNow(k)}
                  className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50">
                  Set a time
                </button>
                {!k.off && (
                  <button type="button" disabled={busy} onClick={() => stopAsking(k)}
                    className="text-[11px] text-gray-400 hover:text-gray-600 disabled:opacity-50">
                    Don&rsquo;t ask
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
