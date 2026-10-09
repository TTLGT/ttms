import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebase-admin';
import { diffFields, writeChange } from '@/lib/recordHistory';
import { Timestamp } from 'firebase-admin/firestore';
import { postOrderAlert, signedAlert } from '@/lib/chatAlerts';
import { STATUS_RANK } from '@/types/order';
import { describeDevice } from '@/types/saRequest';
import { markSigned } from '@/lib/clientAgreements';
import { emailSignedAgreement } from '@/lib/signedAgreementEmail';
import type { OrderStatus } from '@/types/order';

type RouteContext = { params: Promise<{ token: string }> };

// A client signature also renders their signed PDF and emails it. The
// headroom is that, on a cold start.
export const maxDuration = 30;

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

  const body = (await req.json().catch(() => ({}))) as {
    signerName?: unknown; signerTitle?: unknown; esignConsent?: unknown; acceptTerms?: unknown; version?: unknown;
  };
  // The version of the agreement the page showed. A link can be revised in
  // place (src/lib/clientAgreements.ts), so the signature has to say which
  // version it is for — and must not land on one the signer never saw.
  const shownVersion = typeof body.version === 'number' ? body.version : null;
  const signerName = typeof body.signerName === 'string' ? body.signerName : '';
  if (!signerName.trim()) {
    return NextResponse.json({ error: 'Signer name is required' }, { status: 400 });
  }
  // Optional, and capped for the same reason as the user agent: it is the
  // signer's to write, and it lands on the order.
  const signerTitle = typeof body.signerTitle === 'string' ? body.signerTitle.trim().slice(0, 120) : '';
  /*
   * The two boxes on the form, recorded as given. Strictly `true`: a missing
   * key or a string "false" is not consent. Required below for a client
   * agreement; a carrier's link records them when sent and is not refused
   * without them, because carrier links already in inboxes were sent with a
   * page that had one box.
   */
  const esignConsent = body.esignConsent === true;
  const acceptTerms  = body.acceptTerms === true;

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  // The device, beside the IP: part of the same legal record. The raw user
  // agent is kept as evidence; the summary ("Chrome on Windows") is what the
  // order screen and the room show. Capped, because the header is the
  // signer's to write and a 50 KB one should not land on the order.
  const userAgent = (req.headers.get('user-agent') ?? '').slice(0, 500);
  const device    = describeDevice(userAgent);

  // Computed once, outside the transaction: Firestore may run the callback
  // again if the token document is contended, and the signature should record
  // when the carrier submitted rather than which retry happened to win.
  const now    = Timestamp.now();
  const signer = signerName.trim().slice(0, 120);

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
  let signed: { orderId: string; by: 'carrier' | 'client' } | null = null;

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

      // Checked before "already signed": a signed link that has since been
      // put on hold or cancelled must say that, not invite a second look.
      if (data.revokedAt) {
        throw new SignError('This link is no longer valid. Please contact your dispatcher for a new one.', 410);
      }
      if (data.heldAt) {
        throw new SignError('This agreement is being updated. You will be sent the new version shortly, on this same link.', 409);
      }
      if (data.usedAt) {
        throw new SignError('This document has already been signed', 409);
      }
      if (data.expiresAt.toDate() < new Date()) {
        throw new SignError('This signing link has expired', 410);
      }

      // `shipper_agreement` is the client's load confirmation. The token type
      // is historical — it names the field it writes, not who receives it.
      const isClient = data.type === 'shipper_agreement';

      // The page will not submit without both boxes ticked; this is the check
      // that counts. A client signature recorded without either consent is
      // one we could not stand behind. A page opened before this was deployed
      // sends neither, and is told to reload rather than signing on the old one.
      // A versioned link (every client link sent since revisions existed) must
      // be signed against the version on screen. A revision sent while the
      // page was open would otherwise take a signature for wording the client
      // never read.
      const linkVersion = typeof data.version === 'number' ? data.version : null;
      if (linkVersion !== null && shownVersion !== linkVersion) {
        throw new SignError('This agreement was updated after you opened it. Please reload the page and review the new version before signing.', 409);
      }

      if (isClient && (!esignConsent || !acceptTerms)) {
        throw new SignError(
          'Please tick both boxes — consent to sign electronically and acceptance of the terms. If you do not see them, reload the page.',
          400,
        );
      }

      const orderRef = adminDb.collection('orders').doc(data.orderId);
      const orderSnap = await tx.get(orderRef);

      const orderUpdate: Record<string, unknown> = isClient
        ? {
            shipperSignedAt:    now,
            shipperSignerName:  signer,
            shipperSignerIp:    ip,
            shipperSignerUserAgent: userAgent,
            shipperSignerDevice:    device,
            shipperSignerTitle:     signerTitle,
            shipperSignedVersion:   linkVersion,
            updatedAt:          FieldValue.serverTimestamp(),
          }
        : {
            carrierSignedAt:   now,
            carrierSignerName: signer,
            carrierSignerIp:   ip,
            carrierSignerUserAgent: userAgent,
            carrierSignerDevice:    device,
            carrierSignerTitle:     signerTitle,
            updatedAt:         FieldValue.serverTimestamp(),
          };

      /*
       * The signature always lands; the status only ever moves forward.
       *
       * Setting it outright was safe while the two signatures came back in a
       * fixed order. They no longer do — a load dispatched without a client
       * signature can have its carrier sign first and the client sign days
       * later — and `shipper_signed` now ranks below `carrier_signed`, so a
       * blind write would drag a load that is already in transit back to
       * "Client Signed" and undo everything downstream of it.
       *
       * A cancelled order is left where it is: it has no rank, and a signature
       * arriving on a dead load is not a reason to revive it.
       */
      const current = orderSnap.data()?.status as OrderStatus | undefined;
      const next    = (isClient ? 'shipper_signed' : 'carrier_signed') as OrderStatus;
      const rankOf  = (st: OrderStatus | undefined) =>
        st && st in STATUS_RANK ? STATUS_RANK[st as keyof typeof STATUS_RANK] : -1;
      if (current !== 'cancelled' && rankOf(next) > rankOf(current)) {
        orderUpdate.status = next;
      }

      tx.update(tokenRef, {
        usedAt:     now,
        signerName: signer,
        signerIp:   ip,
        signerUserAgent: userAgent,
        signerDevice:    device,
        signerTitle,
        // What they agreed to sits on this same document as `termsText` (for
        // a client link) — the copy they were shown, not today's setting.
        esignConsent,
        termsAccepted: acceptTerms,
        signedVersion: linkVersion,
      });
      // The order's link pointer learns this version is signed, in the same
      // transaction, so an edit a second later knows to ask for a re-sign.
      if (isClient && linkVersion !== null) {
        const mark = markSigned(data.orderId, linkVersion, now);
        tx.set(mark.ref, mark.data, { merge: true });
      }
      tx.update(orderRef, orderUpdate);

      // The order's change history, in the same transaction so it can never
      // disagree with the signature it describes. This is an addition beside
      // the legal record on the token, not a replacement for it: the token
      // still carries the signer's name, IP and time. There is no account
      // behind an outside signer, so the entry names who they said they were
      // and the address the link was emailed to.
      if (orderSnap.exists) {
        writeChange(tx, orderRef, {
          action:  'event',
          summary: isClient
            ? `${signer}${signerTitle ? ` (${signerTitle})` : ''} signed the load confirmation for the client`
            : `${signer}${signerTitle ? ` (${signerTitle})` : ''} signed the rate confirmation for the carrier`,
          fields:  diffFields(orderSnap.data()!, orderUpdate),
        }, {
          uid:   '',
          name:  signer,
          email: String((isClient ? data.clientEmail : data.carrierEmail) ?? ''),
          via:   'signer',
        }, now);
      }

      return {
        orderId: data.orderId as string,
        by: (isClient ? 'client' : 'carrier') as 'carrier' | 'client',
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
    await postOrderAlert(signed.orderId, `${signedAlert(signed.by, signer)} Signed electronically on ${device}.`).catch(() => {});
  }

  /*
   * The client's copy of what they signed, by email, now. After the
   * transaction and swallowed, like the alert: the signature is the legal
   * record, and an email that failed must never undo it or tell the client
   * signing failed. They can download the same PDF from the link.
   */
  if (signed?.by === 'client') {
    await emailSignedAgreement(token).catch((e) => console.error('Signed SA email failed:', e));
  }

  return NextResponse.json({ success: true });
}
