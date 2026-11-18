'use client';

import { auth } from './firebase';
import type { MonthlyUpdate } from '@/types/monthlyUpdate';

/** Browser side of the monthly update pages, served by /api/monthly-updates/{month}. */
export async function getMonthlyUpdate(month: string): Promise<MonthlyUpdate> {
  const user = auth.currentUser;
  if (!user) throw new Error('You are not signed in.');

  const res = await fetch(`/api/monthly-updates/${encodeURIComponent(month)}`, {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not load the update.');
  return data as MonthlyUpdate;
}
