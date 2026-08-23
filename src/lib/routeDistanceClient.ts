import { auth } from './firebase';
import type { Address } from '@/types/order';
import type { LaneMilesSource } from '@/types/order';

/**
 * Client half of the lane distance lookup. Which method runs — the free
 * offline estimate or a billed Google Routes call — is decided server-side
 * from the admin setting, never by the caller. See /api/route-distance.
 */

export type DistanceResult =
  | { status: 'ok'; miles: number; source: LaneMilesSource; straightLineMiles?: number; degraded?: string }
  /** Lane distances are switched off in Settings. */
  | { status: 'disabled' }
  /** One or both addresses have no usable ZIP yet. */
  | { status: 'need_zip'; degraded?: string }
  | { status: 'unknown_zip'; zip: string; degraded?: string }
  | { status: 'error'; message: string };

export async function fetchLaneDistance(
  origin: Address,
  destination: Address,
): Promise<DistanceResult> {
  const user = auth.currentUser;
  if (!user) return { status: 'error', message: 'Not signed in' };

  try {
    const res = await fetch('/api/route-distance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await user.getIdToken()}`,
      },
      body: JSON.stringify({ origin, destination }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { status: 'error', message: (data as { error?: string }).error ?? 'Distance lookup failed' };
    }
    return data as DistanceResult;
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : 'Distance lookup failed' };
  }
}
