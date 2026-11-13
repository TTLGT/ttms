'use client';

import { auth } from './firebase';
import type { PaperworkResponse } from '@/types/paperwork';

/** The Approvals screen's Agreements and BOLs card, from the browser. See src/types/paperwork.ts. */

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

/** Everything still in play, and everything with a step between `from` and `to` (epoch ms). */
export async function listPaperwork(from: number, to: number): Promise<PaperworkResponse> {
  const res = await fetch(`/api/approvals/paperwork?from=${Math.round(from)}&to=${Math.round(to)}`, { headers: await authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as PaperworkResponse;
}
