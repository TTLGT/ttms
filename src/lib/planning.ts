'use client';

import { authedFetch } from './personalTasks';
import type { PlanningDay, PlanningKind, PlanningStatus } from '@/types/planning';

/** Browser side of /api/me/planning — see src/types/planning.ts. */

export async function getMyPlanning(): Promise<PlanningStatus[]> {
  const data = await authedFetch<{ kinds?: PlanningStatus[] }>('/api/me/planning');
  return data.kinds ?? [];
}

/** The caller's working hours and timed items on one day, for the card's "Your day". */
export async function getMyPlanningDay(date: string): Promise<PlanningDay> {
  const data = await authedFetch<{ day: PlanningDay }>(`/api/me/planning/day?date=${encodeURIComponent(date)}`);
  return data.day;
}

export async function scheduleMyPlanning(input: {
  kind: PlanningKind; time: string; title?: string; minutes?: number; weekday?: number; nth?: number; everyWeekday?: boolean;
}): Promise<PlanningStatus> {
  const data = await authedFetch<{ status: PlanningStatus }>('/api/me/planning', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.status;
}

/** Use a task or event the person already has as this kind's slot. */
export async function linkMyPlanning(kind: PlanningKind, taskId: string): Promise<PlanningStatus> {
  const data = await authedFetch<{ status: PlanningStatus }>('/api/me/planning', {
    method: 'PUT',
    body: JSON.stringify({ kind, taskId }),
  });
  return data.status;
}

export async function setMyPlanningPrompt(kind: PlanningKind, action: 'snooze' | 'off' | 'on'): Promise<void> {
  await authedFetch('/api/me/planning', { method: 'PATCH', body: JSON.stringify({ kind, action }) });
}
