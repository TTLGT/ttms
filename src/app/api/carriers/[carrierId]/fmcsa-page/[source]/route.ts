import { NextRequest, NextResponse } from 'next/server';
import { adminDb, requirePermission, AdminAuthError } from '@/lib/firebase-admin';
import { carrierNumber } from '@/types/carrier';
import { fetchFmcsaPage, FmcsaPageUnavailableError } from '@/lib/fmcsaPages';
import { fmcsaPageUrl, isFmcsaPageSource, isShownInTtms } from '@/types/fmcsaPage';

type RouteContext = { params: Promise<{ carrierId: string; source: string }> };

// Up to a page and six stylesheets at 12 seconds each, though FMCSA is
// usually done in two.
export const maxDuration = 60;

/**
 * One of FMCSA's public pages about a carrier, fetched from the US so the
 * Guatemala office can read it without a VPN — see lib/fmcsaPages.
 *
 * Gated on `carriers.view`, like the FMCSA check beside it. The numbers come
 * off the carrier record, never from the request, so this can only ever
 * fetch a page on `FMCSA_PAGES_SHOWN_IN_TTMS` about a carrier TTMS holds.
 * The DOT falls back to the one FMCSA itself returned on the last check, for
 * a carrier saved by MC alone; that too is on the record, not something a
 * caller sent.
 *
 * Writes nothing. Reading a public page is not a check, and does not go in
 * the change log.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    await requirePermission(req, 'carriers.view');
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const { carrierId, source } = await params;
  if (!isFmcsaPageSource(source) || !isShownInTtms(source)) {
    return NextResponse.json({ error: 'Unknown FMCSA page' }, { status: 404 });
  }

  const snap = await adminDb.collection('carriers').doc(carrierId).get();
  if (!snap.exists) return NextResponse.json({ error: 'Carrier not found' }, { status: 404 });
  const data = snap.data() ?? {};

  const dot = carrierNumber(data.dot as string | undefined)
    || carrierNumber(data.fmcsa?.dotNumber as string | undefined);
  const mc  = carrierNumber(data.mc as string | undefined);
  const url = fmcsaPageUrl(source, dot, mc);
  if (!url) {
    return NextResponse.json(
      { error: 'This carrier has no DOT number on record, which this FMCSA page needs.' },
      { status: 400 },
    );
  }

  try {
    const html = await fetchFmcsaPage(url);
    return NextResponse.json({
      html,
      url,
      companyName: (data.companyName as string | undefined) ?? '',
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    if (e instanceof FmcsaPageUnavailableError) {
      return NextResponse.json({ error: e.message, url }, { status: 502 });
    }
    return NextResponse.json({ error: 'Could not load the FMCSA page.', url }, { status: 500 });
  }
}
