'use client';

import { auth } from './firebase';
import type { Change } from '@/types/changelog';

/** Browser side of the Change history, served by /api/changelog. */
export async function listChanges(): Promise<Change[]> {
  const user = auth.currentUser;
  if (!user) throw new Error('You are not signed in.');

  const res = await fetch('/api/changelog', {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not load the change history.');
  return (data.changes ?? []) as Change[];
}
