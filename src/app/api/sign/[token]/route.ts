import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

type RouteContext = { params: Promise<{ token: string }> };

/**
 * Carries the HTTP status out of the transaction callback.
 *
 * The validity checks have to happen inside the transaction to mean anything,
 * but the callback can only signal failure by throwing — so the status the
 * carrier should see rides along on the error.
 */
class SignError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { token } = await params;

  const { signerName } = (await req.json()) as { signerName: string };
  if (!signerName?.trim()) {
    return NextResponse.json({ error: 'Signer name is required' }, { status: 400 });
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  // Computed once, outside the transaction: Firestore may run the callback
  // again if the token document is contended, and the signature should record
  // when the carrier submitted rather than which retry happened to win.
  const now    = Timestamp.now();
  const signer = signerName.trim();

  const tokenRef = adminDb.collection('signing_tokens').doc(token);

  try {
    /**
     * One transaction, for two separate reasons.
     *
     * The single-use check is only worth something if nothing can slip between
     * reading `usedAt` and setting it. Read-then-write as two round trips let
     * two submissions of the same link both see "unsigned" and both write, and
     * the second silently overwrote the first — two people signed, one name
     * survived, neither was told. The form's disabled button does not cover
     * this: it is per-browser, and the link can be forwarded or posted directly.
     *
     * It also makes burning the link and advancing the order atomic. As two
     * independent writes, the token could be marked used while the order update
     * failed — leaving a carrier who signed, an order that says they did not,
     * and a link that refuses to work a second time.
     */
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(tokenRef);
      if (!snap.exists) {
        throw new SignError('Invalid or expired signing link', 404);
      }

      const data = snap.data()!;

      if (data.usedAt) {
        throw new SignError('This document has already been signed', 409);
      }
      if (data.expiresAt.toDate() < new Date()) {
        throw new SignError('This signing link has expired', 410);
      }

      const isShipper = data.type === 'shipper_agreement';

      const orderUpdate = isShipper
        ? {
            status:             'shipper_signed',
            shipperSignedAt:    now,
            shipperSignerName:  signer,
            shipperSignerIp:    ip,
            updatedAt:          FieldValue.serverTimestamp(),
          }
        : {
            status:            'carrier_signed',
            carrierSignedAt:   now,
            carrierSignerName: signer,
            carrierSignerIp:   ip,
            updatedAt:         FieldValue.serverTimestamp(),
          };

      tx.update(tokenRef, {
        usedAt:     now,
        signerName: signer,
        signerIp:   ip,
      });
      tx.update(adminDb.collection('orders').doc(data.orderId), orderUpdate);
    });
  } catch (e) {
    if (e instanceof SignError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  return NextResponse.json({ success: true });
}
