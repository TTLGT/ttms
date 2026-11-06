'use client';

import { authedFetch } from '@/lib/personalTasks';
import type { OnboardingProgram, OnboardingViewer, ProgressSummary } from '@/types/onboarding';
import type { OnboardingPerson } from '@/lib/onboardingServer';

/**
 * My onboarding from the browser. Everything goes through /api/onboarding —
 * the collection is closed to the client SDK. See src/types/onboarding.ts.
 */

export interface MyOnboarding {
  program: OnboardingProgram;
  manages: boolean;
  leadsTeam: boolean;
  name: string;
}

export const getMyOnboarding = () => authedFetch<MyOnboarding>('/api/onboarding/me');

export const postMyOnboarding = (body: Record<string, unknown>) =>
  authedFetch<{ program: OnboardingProgram }>('/api/onboarding/me', { method: 'POST', body: JSON.stringify(body) });

export interface PersonRow {
  person: OnboardingPerson;
  program: OnboardingProgram;
  summary: ProgressSummary;
}

export const listOnboardingPeople = () =>
  authedFetch<{ people: PersonRow[]; manages: boolean }>('/api/onboarding/people');

export type PersonDetail = PersonRow & { viewer: OnboardingViewer };

export const getOnboardingPerson = (email: string) =>
  authedFetch<PersonDetail>(`/api/onboarding/people/${encodeURIComponent(email)}`);

export const patchOnboardingPerson = (email: string, body: Record<string, unknown>) =>
  authedFetch<PersonDetail>(`/api/onboarding/people/${encodeURIComponent(email)}`, { method: 'PATCH', body: JSON.stringify(body) });
