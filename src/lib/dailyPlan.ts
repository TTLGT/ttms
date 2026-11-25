'use client';

import { authedFetch } from './personalTasks';
import type { DailyPlanState, PlanSuggestion } from '@/types/dailyPlan';

/*
 * The browser's half of the planning pop-up — see src/types/dailyPlan.ts.
 *
 * The day's answer is asked for on a full page load only while there is
 * still something to ask. Once the day is settled in this browser — a plan
 * made, a day off, the day closed, or not a working day at all — the last
 * answer is kept in localStorage for the rest of the day and the request is
 * skipped; a planned day asks once more, at its close-of-day time. The server
 * stays the record: the copy here is only ever a reason *not* to ask.
 */

export interface DayPlanReply {
  /** Office day, `YYYY-MM-DD`. */
  today: string;
  state: DailyPlanState;
  /** Their hours today; null when it is not a working day for them. */
  shift: { start: string; end: string } | null;
  /** How many of Today's 3 are picked. */
  picks: number;
}

const CACHE_KEY = 'ttms.dailyPlan.day';

/** The browser's own day — only to tell whether the copy below is from today. */
function localDay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Today's last answer as this browser kept it, or null. */
export function cachedDayPlan(): DayPlanReply | null {
  try {
    const raw = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? 'null');
    return raw && raw.day === localDay() && raw.reply?.state ? (raw.reply as DayPlanReply) : null;
  } catch { return null; }
}

export function cacheDayPlan(reply: DayPlanReply) {
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify({ day: localDay(), reply })); } catch { /* it asks again next load */ }
}

export async function getDayPlan(): Promise<DayPlanReply> {
  const reply = await authedFetch<DayPlanReply>('/api/me/planner/day');
  cacheDayPlan(reply);
  return reply;
}

export async function answerDayPlan(
  action: 'snooze' | 'planned' | 'one' | 'off' | 'closed' | 'closeSkipped',
  extra: { full?: boolean } = {},
): Promise<DailyPlanState> {
  const d = await authedFetch<{ state: DailyPlanState }>('/api/me/planner/day', {
    method: 'PATCH',
    body: JSON.stringify({ action, ...extra }),
  });
  const cached = cachedDayPlan();
  if (cached) cacheDayPlan({ ...cached, state: d.state });
  return d.state;
}

export async function getPlanSuggestions(): Promise<PlanSuggestion[]> {
  const d = await authedFetch<{ suggestions: PlanSuggestion[] }>('/api/me/planner/suggestions');
  return d.suggestions ?? [];
}

/** Share the day's plan with the person's manager — the same copy "Share again" makes. */
export async function shareDayPlan(date: string): Promise<void> {
  await authedFetch('/api/me/plan', { method: 'POST', body: JSON.stringify({ date }) });
}
