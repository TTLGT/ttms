import { NextRequest, NextResponse } from 'next/server';
import { adminDb, requirePermission, AdminAuthError } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { lookupCarrier, FmcsaNotConfiguredError, FmcsaUnavailableError } from '@/lib/fmcsa';
import { carrierNumber } from '@/types/carrier';

type RouteContext = { params: Promise<{ carrierId: string }> };

/**
 * Ask FMCSA about a carrier and store the answer on it as `fmcsa`.
 *
 * Gated on `carriers.view`, not `.edit`: checking a carrier is part of
 * deciding whether to book it, and everybody who can book one can see one.
 * What it writes is FMCSA's answer and who asked, nothing a broker chose —
 * which is also why it is a route at all. The rules refuse `fmcsa` from the
 * browser, so a check cannot be invented, and the key stays on the server.
 *
 * The numbers are read off the carrier record, never taken from the request:
 * a check filed under a carrier has to be about that carrier's numbers.
 *
 * When FMCSA cannot be reached the stored check is left as it was. An outage
 * says nothing about the carrier, and overwriting yesterday's answer with
 * "unknown" would throw away the last thing we knew.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  let caller: { uid: string; email: string | undefined };
  try {
    caller = await requirePermission(req, 'carriers.view');
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const { carrierId } = await params;
  const ref  = adminDb.collection('carriers').doc(carrierId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Carrier not found' }, { status: 404 });

  const dot = carrierNumber(snap.data()?.dot as string | undefined);
  const mc  = carrierNumber(snap.data()?.mc as string | undefined);
  if (!dot && !mc) {
    return NextResponse.json(
      { error: 'Add a DOT or MC number to this carrier before checking FMCSA.' },
      { status: 400 },
    );
  }

  let lookup;
  try {
    lookup = await lookupCarrier(dot, mc);
  } catch (e) {
    if (e instanceof FmcsaNotConfiguredError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    if (e instanceof FmcsaUnavailableError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    // Deliberately not the error's own message: see the key note in lib/fmcsa.
    return NextResponse.json({ error: 'The FMCSA check failed.' }, { status: 500 });
  }

  const profile = await adminDb.collection('users').doc(caller.uid).get();
  const checkedByName =
    (profile.data()?.displayName as string | undefined)?.trim() || caller.email || 'Someone';
  const checkedAt = Timestamp.now();

  // `updatedAt` is left alone: a check is not an edit to the carrier, and
  // bumping it would make every carrier anybody looked at read as changed.
  await ref.update({ fmcsa: { ...lookup, checkedAt, checkedByName } });

  return NextResponse.json({
    check: { ...lookup, checkedByName, checkedAt: checkedAt.toDate().toISOString() },
  });
}
