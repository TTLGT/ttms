import { auth } from './firebase';
import type { WordActivity, WordRecord } from '@/types/vocabulary';

/**
 * Browser helpers for the Learn English word list, which lives behind
 * /api/me/words — see src/types/vocabulary.ts for why it is not read direct.
 */

async function authedFetch<T>(input: string, init: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('You are not signed in.');

  const idToken = await user.getIdToken();
  const res = await fetch(input, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${idToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}

export async function getMyWords(): Promise<Record<string, WordRecord>> {
  const data = await authedFetch<{ words?: Record<string, WordRecord> }>('/api/me/words');
  return data.words ?? {};
}

/**
 * `keepalive` for the save made as the tab is hidden or closed: without it
 * the browser is free to drop the request when the page goes away, and the
 * last few words somebody looked up would never be counted.
 */
export async function saveWordActivity(activity: WordActivity, keepalive = false): Promise<void> {
  await authedFetch('/api/me/words', {
    method: 'POST',
    body: JSON.stringify(activity),
    keepalive,
  });
}
