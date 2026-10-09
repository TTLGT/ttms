'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, CalendarClock } from 'lucide-react';
import { getMyPlanning, setMyPlanningPrompt } from '@/lib/planning';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { formatTime, repeatText, type PersonalTask } from '@/types/task';
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
export default function PlanningPanel({ tasks }: { tasks?: PersonalTask[] | null }) {
  const { formatCalendarDate } = useDateFormatters();
  const [fetched, setFetched] = useState<PlanningStatus[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setFetched(await getMyPlanning()); } catch { setFetched([]); }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(PLANNING_CHANGED_EVENT, load);
    return () => window.removeEventListener(PLANNING_CHANGED_EVENT, load);
  }, [load]);

  // Which items on the calendar are planning slots. When that set changes — a
  // slot deleted, rescheduled into a copy, a repeat carried on — ask the
  // server again, since only it follows the pointer from one to the next.
  // Run after the calendar's own save has landed, not on its optimistic draw.
  const slotIds = useMemo(
    () => (tasks ?? []).filter((t) => t.planning).map((t) => t.id).sort().join(','),
    [tasks],
  );
  const [seenSlotIds, setSeenSlotIds] = useState(slotIds);
  useEffect(() => {
    if (slotIds === seenSlotIds) return;
    setSeenSlotIds(slotIds);
    const timer = setTimeout(load, 1500);
    return () => clearTimeout(timer);
  }, [slotIds, seenSlotIds, load]);

  // The calendar's copy of a slot wins over what the server said when the
  // panel loaded: a block dragged or stretched on the grid is saved from the
  // page's own list, and this reads its time from the same list, so the two
  // never show different lengths. Missing from a loaded list means deleted.
  const kinds = useMemo(() => {
    if (!fetched || !tasks) return fetched;
    const byId = new Map(tasks.map((t) => [t.id, t]));
    return fetched.map((k): PlanningStatus => {
      if (!k.scheduled) return k;
      const t = byId.get(k.scheduled.taskId);
      if (!t) return { ...k, scheduled: null };
      return {
        ...k,
        scheduled: {
          ...k.scheduled,
          date: t.date, time: t.time, endTime: t.endTime,
          repeat: t.repeat, repeatWeekday: t.repeatWeekday, repeatNths: t.repeatNths, repeatUntil: t.repeatUntil,
        },
      };
    });
  }, [fetched, tasks]);

  async function askNow(k: PlanningStatus, pick = false) {
    setBusy(true);
    try {
      await setMyPlanningPrompt(k.kind, 'on');
      window.dispatchEvent(new CustomEvent(PLANNING_ASK_EVENT, { detail: pick ? { kind: k.kind, pick } : k.kind }));
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
                {/* Already has a task or event for it: link that, rather than make another. */}
                <button type="button" disabled={busy} onClick={() => askNow(k, true)}
                  className="text-[11px] font-medium text-brand-600 hover:underline disabled:opacity-50">
                  Use one you have
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
