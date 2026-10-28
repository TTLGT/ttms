import { NextRequest, NextResponse } from 'next/server';
import { adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { can } from '@/lib/accessControl';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { FmcsaNotConfiguredError, FmcsaUnavailableError, searchCarriersByName, type FmcsaNameMatch } from '@/lib/fmcsa';
import { carrierNameKey } from '@/types/carrier';
import { ORDER_FILES_COLLECTION } from '@/types/orderFile';
import type { DetectedCarrier } from '@/types/signatureRecord';
import type { CarrierCandidate } from '@/types/signedDocument';

type RouteContext = { params: Promise<{ orderId: string; fileId: string }> };

/**
 * Who the carrier on a signed dispatch sheet is, so the load can be given its
 * carrier before the sheet is verified (see src/types/signatureRecord.ts).
 *
 * Answers with what the sheet names, the carriers already in TTMS that match
 * it — by MC or DOT if the sheet printed one, else by name — and, only when
 * nothing here matches, the companies FMCSA lists under that name. Nothing is
 * written: linking is the ordinary order save, and adding a carrier is the
 * ordinary Add Carrier window, whose FMCSA lookup says again if the company
 * turns out to be here under another name.
 *
 * Gated on seeing the load and `carriers.view`, the permission that lists
 * carriers at all.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { orderId, fileId } = await params;
  try {
    const caller = await requireCaller(req);
    await getVisibleOrder(caller, orderId);
    if (!can(caller.profile, 'carriers.view')) {
      return NextResponse.json({ error: 'You cannot look carriers up.' }, { status: 403 });
    }
    const snap = await adminDb.collection(ORDER_FILES_COLLECTION).doc(fileId).get();
    if (!snap.exists || snap.data()!.orderId !== orderId) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    const read = ((snap.data()!.detected as { carrier?: DetectedCarrier | null } | null)?.carrier ?? null);
    if (!read) return NextResponse.json({ read: null, matches: [], fmcsa: [], fmcsaError: '' });

    const col = adminDb.collection('carriers');
    const key = read.name ? carrierNameKey(read.name) : '';
    // The first two words of the name, as a prefix: "ka lines" finds
    // "KA LINES INC" and "KA Lines LLC" alike. One range on the indexed key.
    const stem = key.split(' ').slice(0, 2).join(' ');
    const [byMc, byDot, byName] = await Promise.all([
      read.mc ? col.where('mc', '==', read.mc).limit(5).get() : null,
      read.dot ? col.where('dot', '==', read.dot).limit(5).get() : null,
      stem ? col.where('nameKey', '>=', stem).where('nameKey', '<', `${stem}`).limit(8).get() : null,
    ]);
    const seen = new Map<string, CarrierCandidate>();
    for (const s of [byMc, byDot, byName]) for (const d of s?.docs ?? []) {
      const c = d.data();
      seen.set(d.id, {
        id: d.id,
        companyName: String(c.companyName ?? ''),
        mc: String(c.mc ?? ''),
        dot: String(c.dot ?? ''),
        phone: String(c.phone ?? ''),
        isActive: c.isActive !== false,
      });
    }
    // The exact name first, then the rest as found.
    const matches = [...seen.values()].sort((a, b) =>
      Number(carrierNameKey(b.companyName) === key) - Number(carrierNameKey(a.companyName) === key));

    let fmcsa: FmcsaNameMatch[] = [];
    let fmcsaError = '';
    if (matches.length === 0 && read.name) {
      try {
        fmcsa = await searchCarriersByName(read.name);
      } catch (e) {
        // Said as what it is, never the request URL — it carries the key.
        fmcsaError = e instanceof FmcsaNotConfiguredError || e instanceof FmcsaUnavailableError
          ? e.message : 'The FMCSA search failed.';
      }
    }
    return NextResponse.json({ read, matches, fmcsa, fmcsaError }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
