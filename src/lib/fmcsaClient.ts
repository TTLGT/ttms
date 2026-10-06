import { Timestamp } from 'firebase/firestore';
import { auth } from './firebase';
import type { FmcsaCheck } from '@/types/fmcsa';

/**
 * Browser half of the FMCSA check. The lookup, the key and the write all
 * happen in `POST /api/carriers/{id}/fmcsa`; this only asks for it and hands
 * back the stored shape, so a fresh check and one read off the carrier record
 * draw through the same code.
 */
export async function runFmcsaCheck(carrierId: string): Promise<FmcsaCheck> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');

  const res = await fetch(`/api/carriers/${encodeURIComponent(carrierId)}/fmcsa`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    check?: Omit<FmcsaCheck, 'checkedAt'> & { checkedAt: string };
  };
  if (!res.ok || !data.check) throw new Error(data.error ?? 'The FMCSA check failed.');

  return { ...data.check, checkedAt: Timestamp.fromDate(new Date(data.check.checkedAt)) };
}
