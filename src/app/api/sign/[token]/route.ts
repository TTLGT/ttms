import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { postOrderAlert, signedAlert } from '@/lib/chatAlerts';

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

  /**
   * What was signed, carried out of the transaction so the room can be told
   * afterwards.
   *
   * Returned out of the callback rather than assigned into a variable from
   * inside it, so it is only ever read from a transaction that committed. The
   * chat write deliberately does not happen inside the transaction: Firestore
   * may run that callback more than once under contention, which would post
   * the alert twice, and a failure to write into a chat room must never roll
   * back a signature that is a legal record.
   */
  let signed: { orderId: string; by: 'carrier' | 'shipper' } | null = null;

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
    signed = await adminDb.runTransaction(async (tx) => {
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

      return {
        orderId: data.orderId as string,
        by: (isShipper ? 'shipper' : 'carrier') as 'carrier' | 'shipper',
      };
    });
  } catch (e) {
    if (e instanceof SignError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  /*
   * The alert everybody actually wants.
   *
   * This is the one event in TTMS that happens with nobody signed in and
   * nobody watching: a carrier opens a link from their phone at eleven at
   * night and signs, and until somebody reloads the order in the morning the
   * office has no way of knowing. A line in the room about that load is the
   * whole answer, and it costs one write.
   *
   * After the transaction, and swallowed: the signature is recorded and the
   * carrier is owed a success either way.
   */
  if (signed) {
    await postOrderAlert(signed.orderId, signedAlert(signed.by, signer)).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
