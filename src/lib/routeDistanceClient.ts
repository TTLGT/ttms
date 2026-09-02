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
  /**
   * Google Routes is the chosen method and this lane has never been looked up,
   * so answering it would be billed. Nothing happens until the caller asks
   * again with `manual`, which is what the button in the form does.
   */
  | { status: 'needs_lookup' }
  /** One or both addresses have no usable ZIP yet. */
  | { status: 'need_zip'; degraded?: string }
  | { status: 'unknown_zip'; zip: string; degraded?: string }
  | { status: 'error'; message: string };

/**
 * @param manual A person asked for this — they clicked a button. Under Google
 *   Routes an unlooked-up lane is only fetched, and billed, when this is set;
 *   without it the server answers from its cache or says `needs_lookup`. Leave
 *   it off for anything that fires on its own, such as a form watching an
 *   address being typed.
 */
export async function fetchLaneDistance(
  origin: Address,
  destination: Address,
  manual = false,
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
      body: JSON.stringify({ origin, destination, manual }),
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
