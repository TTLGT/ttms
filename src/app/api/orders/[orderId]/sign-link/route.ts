import { NextRequest, NextResponse } from 'next/server';
import { adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { signUrl } from '@/lib/appUrl';
import { clientAgreementRef, type ClientAgreementPointer } from '@/lib/clientAgreements';

type RouteContext = { params: Promise<{ orderId: string }> };

/**
 * The client's signing link for this load and where it stands, so it can be
 * copied off the order and sent some other way — a text, WhatsApp, a
 * different inbox — when the email has not arrived or went to the wrong
 * person.
 *
 * Same boundary as the order: anybody who can open the load can see its link.
 * That is the same reach as the line the send route already posts in the
 * load's room, and a signature made from the link records the device and
 * address it came from, so staff opening it cannot pass for the client.
 *
 * - `live`    — the client can open and sign it.
 * - `held`    — the order changed; it says "being updated" until dispatch
 *               reviews and sends the update. See src/lib/clientAgreements.ts.
 * - `signed`  — the current version is signed.
 * - `expired` — past its date; sending again renews the same link.
 *
 * A load whose SA went out before links were kept per order has no pointer;
 * its newest usable link is found the old way, by query.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    await getVisibleOrder(caller, orderId);
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const noStore = { headers: { 'Cache-Control': 'private, no-store' } };

  const pointerSnap = await clientAgreementRef(orderId).get();
  if (pointerSnap.exists) {
    const p = pointerSnap.data() as ClientAgreementPointer;
    const token = p.token && !p.clientChanged ? await adminDb.collection('signing_tokens').doc(p.token).get() : null;
    const data = token?.exists ? token.data()! : null;
    if (!data || data.revokedAt) return NextResponse.json({ link: null }, noStore);
    const expired = data.expiresAt?.toMillis?.() <= Date.now();
    const state = data.heldAt ? 'held'
      : p.signedVersion != null && p.signedVersion === p.version ? 'signed'
      : expired ? 'expired'
      : 'live';
    return NextResponse.json({
      link: {
        url: signUrl(token!.id),
        state,
        version: Number(data.version ?? 1),
        sentTo: typeof data.clientEmail === 'string' ? data.clientEmail : '',
        sentAt: (data.lastSentAt ?? data.createdAt)?.toDate?.()?.toISOString?.() ?? null,
        expiresAt: data.expiresAt?.toDate?.()?.toISOString?.() ?? null,
      },
    }, noStore);
  }

  // One equality filter and the rest in memory, so no composite index is
  // needed; a load has a handful of tokens at most.
  const snap = await adminDb.collection('signing_tokens').where('orderId', '==', orderId).get();
  const now = Date.now();
  const newest = snap.docs
    .map((d) => ({ id: d.id, data: d.data() }))
    // `shipper_agreement` is the client's load confirmation; the name is historical.
    .filter(({ data }) => data.type === 'shipper_agreement' && !data.usedAt
      && typeof data.expiresAt?.toMillis === 'function' && data.expiresAt.toMillis() > now)
    .sort((a, b) => (b.data.createdAt?.toMillis?.() ?? 0) - (a.data.createdAt?.toMillis?.() ?? 0))[0];
  if (!newest) return NextResponse.json({ link: null }, noStore);

  return NextResponse.json({
    link: {
      url: signUrl(newest.id),
      state: 'live',
      version: 1,
      sentTo: typeof newest.data.clientEmail === 'string' ? newest.data.clientEmail : '',
      sentAt: newest.data.createdAt?.toDate?.()?.toISOString?.() ?? null,
      expiresAt: newest.data.expiresAt.toDate().toISOString(),
    },
  }, noStore);
}
