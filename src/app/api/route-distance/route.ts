import { NextRequest, NextResponse } from 'next/server';
import { adminDb, requireCompanyUser, AdminAuthError } from '@/lib/firebase-admin';
import { estimateRouteMiles } from '@/lib/routeDistance';
import { lookupDrivingMiles } from '@/lib/routeDistanceGoogle';
import { DEFAULT_APP_SETTINGS, isLaneDistanceMode } from '@/types/appSettings';
import type { LaneDistanceMode } from '@/types/appSettings';
import type { Address } from '@/types/order';

/**
 * Lane distance for an order, by whichever method the admin has selected.
 *
 * The mode is read here rather than trusted from the request: a client that
 * could name its own method could run up a Google Routes bill regardless of
 * what Settings says.
 */
async function currentMode(): Promise<LaneDistanceMode> {
  try {
    const snap = await adminDb.collection('appSettings').doc('general').get();
    const stored = snap.exists ? snap.data()?.laneDistanceMode : null;
    return isLaneDistanceMode(stored) ? stored : DEFAULT_APP_SETTINGS.laneDistanceMode;
  } catch {
    // A settings read failure must not take the order form down with it.
    return DEFAULT_APP_SETTINGS.laneDistanceMode;
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireCompanyUser(req);
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    origin?: Address;
    destination?: Address;
  } | null;

  if (!body?.origin || !body?.destination) {
    return NextResponse.json({ error: 'origin and destination are required' }, { status: 400 });
  }

  const mode = await currentMode();
  if (mode === 'off') return NextResponse.json({ status: 'disabled' });

  if (mode === 'routes') {
    const routed = await lookupDrivingMiles(body.origin, body.destination);
    if (routed.status === 'ok') {
      return NextResponse.json({ status: 'ok', miles: routed.miles, source: 'routes' });
    }
    // Rather than show a broker nothing, fall through to the free estimate and
    // label it as such. A missing key, a billing lapse or an address Google
    // cannot route should degrade the number's accuracy, not remove it.
    if (routed.status === 'error') {
      const fallback = estimateRouteMiles(body.origin, body.destination);
      return NextResponse.json(
        fallback.status === 'ok'
          ? { status: 'ok', ...fallback.estimate, source: 'estimate', degraded: routed.message }
          : { ...fallback, degraded: routed.message },
      );
    }
  }

  const result = estimateRouteMiles(body.origin, body.destination);

  // A missing or unrecognised ZIP is a normal state of a half-filled form, not
  // an error — the caller says what is needed and shows no distance.
  return NextResponse.json(
    result.status === 'ok' ? { status: 'ok', ...result.estimate, source: 'estimate' } : result,
  );
}
