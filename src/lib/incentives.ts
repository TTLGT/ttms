import { auth } from './firebase';
import type {
  IncentiveAbilities,
  IncentiveProgram,
  IncentiveProgress,
} from '@/types/incentive';

/**
 * Incentives, from the browser. Everything goes through /api/incentives — the
 * collection is closed to the client SDK. See src/types/incentive.ts.
 */

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export interface MonthView {
  month: string;
  current: string;
  program: IncentiveProgram | null;
  progress: IncentiveProgress[];
  abilities: IncentiveAbilities;
  months: string[];
}

export interface IncentivePerson {
  uid: string;
  name: string;
  email: string;
}

/** A month, or this month (office time) when none is named. */
export function fetchMonth(month?: string): Promise<MonthView> {
  return call('GET', month ? `/api/incentives/${encodeURIComponent(month)}` : '/api/incentives');
}

export async function saveMonth(month: string, program: IncentiveProgram): Promise<IncentiveProgram> {
  return (await call<{ program: IncentiveProgram }>('PUT', `/api/incentives/${encodeURIComponent(month)}`, program)).program;
}

export interface MarkPatch {
  uid: string;
  goalId: string;
  value?: number | null;
  done?: boolean;
  na?: boolean;
  note?: string;
  /** Counted goals only: true to correct TTMS's count (with `value` and `reason`), false to go back to it. */
  corrected?: boolean;
  reason?: string;
}

export async function recordMark(month: string, patch: MarkPatch): Promise<IncentiveProgress> {
  return (await call<{ progress: IncentiveProgress }>('PATCH', `/api/incentives/${encodeURIComponent(month)}/progress`, patch)).progress;
}

export async function fetchPeople(): Promise<IncentivePerson[]> {
  return (await call<{ people: IncentivePerson[] }>('GET', '/api/incentives/people')).people;
}
