'use client';

import { authedFetch } from './personalTasks';
import type { DayPlan, TeamPlansReply } from '@/types/dayPlan';

/** Browser side of shared day plans — see src/types/dayPlan.ts. */

export interface MyPlansReply {
  today: string;
  next: string;
  plans: Record<string, DayPlan | null>;
}

/** What the caller's managers can see of their today and next working day. */
export async function fetchMyPlans(): Promise<MyPlansReply> {
  return authedFetch('/api/me/plan');
}

/** Share a day again from the list as it is now, with these items as Busy. */
export async function shareMyPlan(date: string, busyIds?: string[]): Promise<DayPlan> {
  const { plan } = await authedFetch<{ plan: DayPlan }>('/api/me/plan', {
    method: 'POST',
    body: JSON.stringify({ date, busyIds }),
  });
  return plan;
}

export async function fetchTeamPlans(from: string, to: string = from): Promise<TeamPlansReply> {
  return authedFetch(`/api/team-plans?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
}
