import { NextRequest, NextResponse } from 'next/server';
import { adminDb, requireCompanyUser, AdminAuthError } from '@/lib/firebase-admin';
import { estimateRouteMiles } from '@/lib/routeDistance';
import { lookupDrivingMiles } from '@/lib/routeDistanceGoogle';
import { readCachedLane, writeCachedLane } from '@/lib/laneDistanceCache';
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

/**
 * When a figure worked out on this request was produced.
 *
 * Read off the server's clock rather than the browser's: the date is stored on
 * the order and shown back to everybody, and a laptop set to the wrong day
 * would put a distance in next week. An estimate is recomputed on every
 * request, so for it "now" is always the honest answer.
 */
const nowIso = () => new Date().toISOString();

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
    /**
     * The caller is asking on a person's say-so — a button they clicked —
     * rather than on its own, as a form does while somebody types. Only a
     * manual ask may reach Google, so no automatic path can bill.
     */
    manual?: boolean;
  } | null;

  if (!body?.origin || !body?.destination) {
    return NextResponse.json({ error: 'origin and destination are required' }, { status: 400 });
  }

  const mode = await currentMode();
  if (mode === 'off') return NextResponse.json({ status: 'disabled' });

  if (mode === 'routes') {
    // Every lane Google has already answered is stored, so a repeat lane — the
    // same warehouse pair on a second order, or an order being re-opened — is a
    // Firestore read instead of a billed lookup. Only an admin refresh ever
    // re-asks Google. See `laneDistanceCache.ts`.
    const cached = await readCachedLane(body.origin, body.destination);
    if (cached !== null) {
      // The lane's own date, not now: this number came out of Google whenever
      // the lane was first looked up (or last refreshed), and an order that
      // stores it stores a figure that old. See `laneMilesAt` on Order.
      return NextResponse.json({
        status: 'ok',
        miles: cached.miles,
        source: 'routes',
        calculatedAt: cached.obtainedAt ? cached.obtainedAt.toISOString() : null,
      });
    }

    // A lane nobody has looked up yet costs money to answer, so under Routes
    // it is answered only when somebody asks for it. The order form types a
    // dozen versions of an address on the way to the right one; billing each
    // of them is exactly what the debounce was papering over. The check lives
    // here rather than in the form because it is the spending rule, and a
    // second caller that forgot it would quietly start charging again.
    if (!body.manual) {
      return NextResponse.json({ status: 'needs_lookup' });
    }

    const routed = await lookupDrivingMiles(body.origin, body.destination);
    if (routed.status === 'ok') {
      // Gated on `ok` specifically, never on the response merely being
      // returnable: writing down a degraded fallback would pin this lane to an
      // estimate forever, and fixing the billing would not bring it back.
      await writeCachedLane(body.origin, body.destination, routed.miles);
      return NextResponse.json({
        status: 'ok',
        miles: routed.miles,
        source: 'routes',
        calculatedAt: nowIso(),
      });
    }
    // Rather than show a broker nothing, fall through to the free estimate and
    // label it as such. A missing key, a billing lapse or an address Google
    // cannot route should degrade the number's accuracy, not remove it.
    if (routed.status === 'error') {
      const fallback = estimateRouteMiles(body.origin, body.destination);
      return NextResponse.json(
        fallback.status === 'ok'
          ? { status: 'ok', ...fallback.estimate, source: 'estimate', calculatedAt: nowIso(), degraded: routed.message }
          : { ...fallback, degraded: routed.message },
      );
    }
  }

  const result = estimateRouteMiles(body.origin, body.destination);

  // A missing or unrecognised ZIP is a normal state of a half-filled form, not
  // an error — the caller says what is needed and shows no distance.
  return NextResponse.json(
    result.status === 'ok'
      ? { status: 'ok', ...result.estimate, source: 'estimate', calculatedAt: nowIso() }
      : result,
  );
}
