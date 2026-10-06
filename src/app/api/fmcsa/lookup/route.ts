import { NextRequest, NextResponse } from 'next/server';
import { adminDb, requirePermission, AdminAuthError } from '@/lib/firebase-admin';
import { lookupCarrier, FmcsaNotConfiguredError, FmcsaUnavailableError } from '@/lib/fmcsa';
import { carrierNumber } from '@/types/carrier';

/** Longer than any DOT or MC FMCSA issues; anything past it is not a number. */
const MAX_DIGITS = 10;

/**
 * Look a carrier up on FMCSA before it exists in TTMS, to fill in the Add
 * Carrier form — and to say when it is already here.
 *
 * Gated on `carriers.edit`, the permission that can add one. Writes nothing:
 * the form saves the carrier through the client like any other, and the check
 * is then filed against it by `/api/carriers/{id}/fmcsa`, the one writer of
 * `fmcsa`.
 *
 * The duplicate test is the point as much as the fill-in. Carriers are
 * matched on DOT, or on any MC FMCSA lists under it, which catches the same
 * company typed under a different name — the way the BATS import ended up
 * with several copies of some carriers.
 */
export async function POST(req: NextRequest) {
  try {
    await requirePermission(req, 'carriers.edit');
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const body = (await req.json().catch(() => null)) as { number?: string; kind?: string } | null;
  const number = carrierNumber(body?.number).slice(0, MAX_DIGITS);
  const kind = body?.kind === 'mc' ? 'mc' : 'dot';
  if (!number) {
    return NextResponse.json({ error: 'Type a DOT or MC number to look up.' }, { status: 400 });
  }

  let lookup;
  try {
    lookup = kind === 'dot' ? await lookupCarrier(number, '') : await lookupCarrier('', number);
  } catch (e) {
    if (e instanceof FmcsaNotConfiguredError) return NextResponse.json({ error: e.message }, { status: 503 });
    if (e instanceof FmcsaUnavailableError) return NextResponse.json({ error: e.message }, { status: 502 });
    // Not the error's own message: see the key note in lib/fmcsa.
    return NextResponse.json({ error: 'The FMCSA lookup failed.' }, { status: 500 });
  }

  // Every number that identifies this company, ours or FMCSA's.
  const dots = [...new Set([lookup.dotNumber, kind === 'dot' ? number : ''].filter(Boolean))];
  const mcs  = [...new Set([...lookup.docketNumbers, kind === 'mc' ? number : ''].filter(Boolean))].slice(0, 30);

  const col = adminDb.collection('carriers');
  const [byDot, byMc] = await Promise.all([
    dots.length ? col.where('dot', 'in', dots).limit(1).get() : null,
    mcs.length  ? col.where('mc', 'in', mcs).limit(1).get()   : null,
  ]);
  const hit = byDot?.docs[0] ?? byMc?.docs[0] ?? null;
  const existing = hit
    ? { id: hit.id, companyName: (hit.data().companyName as string) ?? '', isActive: hit.data().isActive !== false }
    : null;

  return NextResponse.json({ lookup, existing });
}
