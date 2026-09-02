import { NextRequest, NextResponse } from 'next/server';
import { adminDb, requirePermission, AdminAuthError } from '@/lib/firebase-admin';
import { lookupDrivingMiles } from '@/lib/routeDistanceGoogle';
import { recordLaneRefresh } from '@/lib/laneDistanceCache';
import { DEFAULT_APP_SETTINGS, isLaneDistanceMode } from '@/types/appSettings';
import type { Address } from '@/types/order';

/**
 * Force a fresh Google Routes lookup for one lane, overwriting what was stored.
 *
 * Normal lookups never re-ask Google once a lane is written down — that is the
 * entire point of the cache. This is the deliberate exception, for when someone
 * believes a stored mileage has gone stale. It is **admin only**: the ordinary
 * `/api/route-distance` is open to every signed-in user and must stay that way,
 * but this one spends money on purpose and every call is logged with who made
 * it and what the number was before.
 */
export async function POST(req: NextRequest) {
  let caller;
  try {
    caller = await requirePermission(req, 'settings.manage');
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    origin?: Address;
    destination?: Address;
    orderId?: string;
  } | null;

  if (!body?.origin || !body?.destination) {
    return NextResponse.json({ error: 'origin and destination are required' }, { status: 400 });
  }

  // The admin setting governs whether Google is ever called, and this route is
  // no exception. Refreshing while the company is on the free estimate would
  // bill a lookup the setting exists to prevent.
  const snap = await adminDb.collection('appSettings').doc('general').get().catch(() => null);
  const stored = snap?.exists ? snap.data()?.laneDistanceMode : null;
  const mode = isLaneDistanceMode(stored) ? stored : DEFAULT_APP_SETTINGS.laneDistanceMode;

  if (mode !== 'routes') {
    return NextResponse.json(
      { error: 'Lane distance is not set to Google Routes, so there is nothing to refresh.' },
      { status: 400 },
    );
  }

  const routed = await lookupDrivingMiles(body.origin, body.destination);

  // Nothing is overwritten unless Google actually answered. A failed refresh
  // must leave the stored mileage exactly as it was — replacing a good number
  // with an estimate because the API was briefly down is the one outcome this
  // whole design is built to avoid.
  if (routed.status !== 'ok') {
    const message =
      routed.status === 'unconfigured' ? 'GOOGLE_MAPS_API_KEY is not set on the server.'
      : routed.status === 'no_route'   ? 'Google could not find a route between these two addresses.'
      : routed.message;
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const result = await recordLaneRefresh(
    body.origin,
    body.destination,
    routed.miles,
    caller,
    body.orderId ?? null,
  );

  return NextResponse.json({
    status: 'ok',
    miles: result.miles,
    previousMiles: result.previousMiles,
    source: 'routes',
  });
}
