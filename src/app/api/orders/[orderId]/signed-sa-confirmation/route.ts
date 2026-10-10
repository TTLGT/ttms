import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, adminStorage, AdminAuthError } from '@/lib/firebase-admin';
import { can } from '@/lib/accessControl';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { actorOf, updateWithHistory } from '@/lib/recordHistory';
import { postOrderAlert } from '@/lib/chatAlerts';
import { clientContactOf } from '@/lib/orderReadinessServer';
import { requestRef } from '@/lib/saRequestsServer';
import { signatureTime } from '@/lib/signed-agreement-pdf';
import { orderDisplayNumber } from '@/types/order';
import { ORDER_FILES_COLLECTION, SIGNED_AGREEMENT_KIND, orderFilePath } from '@/types/orderFile';
import { AGREEMENT_NAME, cleanCcList, isAgreementParty, type AgreementParty } from '@/types/saRequest';

type RouteContext = { params: Promise<{ orderId: string }> };

// Reads the uploaded files out of the bucket and sends them. Headroom for a
// cold start and a few large scans.
export const maxDuration = 60;

/** Resend refuses an email over 40 MB; a little under, for the HTML and encoding. */
const MAX_ATTACHMENT_BYTES = 35 * 1024 * 1024;

/** The order fields each party's last confirmation is recorded in. Server-kept (orderWrites.ts). */
const FIELDS: Record<AgreementParty, { at: string; to: string; by: string }> = {
  client:  { at: 'paperSaConfirmedAt', to: 'paperSaConfirmedTo', by: 'paperSaConfirmedByName' },
  carrier: { at: 'paperCaConfirmedAt', to: 'paperCaConfirmedTo', by: 'paperCaConfirmedByName' },
};

/**
 * Emails the signer that we have registered their acceptance of the agreement,
 * with the signed copy they sent us attached — for somebody who could not
 * sign on the link, whose signed copy (paper, scan, photo) staff uploaded:
 *
 * - `{ party: 'client' }` (the default) — the client's Shipper Agreement, from
 *   the `signed_sa` files, to the client contact and the SA's CC list.
 * - `{ party: 'carrier' }` — the carrier's Carrier Agreement, from the
 *   `signed_ca` files, to the carrier's address and the carrier review's CC
 *   list. Never to the client: it quotes carrier pay.
 *
 * - Who: `orders.sendAgreement` (admin and dispatch), the people who send the
 *   agreements in the first place. Reply-To is whoever sent it.
 * - Refused with nothing uploaded, and once that party has e-signed: then the
 *   e-signature email (src/lib/signedAgreementEmail.ts) is their copy.
 *
 * Every send is recorded on the order (`paperSaConfirmed*` / `paperCaConfirmed*`,
 * the change log) and in the load's room.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    if (!can(caller.profile, 'orders.sendAgreement')) {
      return NextResponse.json({ error: 'Admin and dispatch send this confirmation.' }, { status: 403 });
    }
    const body = (await req.json().catch(() => ({}))) as { party?: unknown };
    const party: AgreementParty = isAgreementParty(body.party) ? body.party : 'client';
    const carrier = party === 'carrier';
    const name = AGREEMENT_NAME[party];

    const order = await getVisibleOrder(caller, orderId);
    if (carrier ? order.carrierSignedAt : order.shipperSignedAt) {
      return NextResponse.json({ error: `The ${carrier ? 'carrier' : 'client'} signed electronically and was already emailed their copy.` }, { status: 409 });
    }
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'Email sending is not configured' }, { status: 503 });
    }

    const snap = await adminDb.collection(ORDER_FILES_COLLECTION)
      .where('orderId', '==', orderId).where('kind', '==', SIGNED_AGREEMENT_KIND[party]).get();
    if (snap.empty) {
      return NextResponse.json({ error: `Upload the signed ${name} first.` }, { status: 409 });
    }

    // Who it goes to: the carrier's own address, or the client contact.
    let to = '';
    let greetName = '';
    let companyName = '';
    if (carrier) {
      const c = typeof order.carrierId === 'string' && order.carrierId
        ? (await adminDb.collection('carriers').doc(order.carrierId).get()).data()
        : undefined;
      to = typeof c?.email === 'string' ? c.email.trim() : '';
      companyName = String(c?.companyName ?? order.carrierName ?? '');
      greetName = companyName;
    } else {
      const contact = await clientContactOf(order.clientId);
      to = contact?.email ?? '';
      companyName = contact?.companyName ?? '';
      greetName = contact?.name || companyName;
    }
    if (!to) {
      return NextResponse.json({ error: `The ${carrier ? 'carrier' : 'client'} has no email address on file.` }, { status: 400 });
    }
    const review = await requestRef(party, orderId).get();
    const cc = cleanCcList(review.data()?.ccEmails).filter((e) => e !== to.toLowerCase());

    const docs = snap.docs.sort((a, b) =>
      (a.data().createdAt?.toMillis?.() ?? 0) - (b.data().createdAt?.toMillis?.() ?? 0));
    const total = docs.reduce((n, d) => n + (Number(d.data().size) || 0), 0);
    if (total > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json({ error: 'The signed files are too large to email together (over 35 MB). Remove a copy or upload a smaller scan.' }, { status: 413 });
    }
    const attachments = await Promise.all(docs.map(async (d) => {
      const [content] = await adminStorage.bucket().file(orderFilePath(orderId, d.id)).download();
      return {
        filename: String(d.data().name ?? `Signed ${name}`).replace(/[\\/:*?"<>|]/g, '-'),
        content,
        contentType: String(d.data().contentType ?? 'application/octet-stream'),
      };
    }));

    const orderNumber = orderDisplayNumber(order as { orderNumber?: string; batsId?: string });
    const docName = carrier ? 'rate confirmation' : 'load confirmation';
    const now = Timestamp.now();
    const sent = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from:    `TTL Dispatch <${process.env.RESEND_FROM_EMAIL ?? 'noreply@totaltransportlogistics.us'}>`,
      to,
      ...(cc.length ? { cc } : {}),
      ...(caller.email ? { replyTo: caller.email } : {}),
      subject: `Acceptance Registered — ${carrier ? 'Rate Confirmation' : 'Load Confirmation'} ${orderNumber}`,
      html:    buildHtml({
        greetName,
        companyName,
        docName,
        orderNumber,
        when: signatureTime(now.toDate()),
        files: attachments.length,
        senderName: caller.displayName,
      }),
      attachments,
    });
    if (sent.error) {
      return NextResponse.json({ error: `The email could not be sent: ${sent.error.message}` }, { status: 502 });
    }

    // After the send, never before: the record says it went out.
    const f = FIELDS[party];
    await updateWithHistory(adminDb.collection('orders').doc(orderId), {
      [f.at]: now,
      [f.to]: to,
      [f.by]: caller.displayName,
    }, actorOf(caller),
    `Emailed the ${carrier ? 'carrier' : 'client'} that their acceptance is registered, with the signed ${name} attached (${attachments.length} file${attachments.length === 1 ? '' : 's'}), to ${to}${cc.length ? `, copied to ${cc.join(', ')}` : ''}`,
    ).catch(() => {});
    await postOrderAlert(orderId,
      `${caller.displayName} emailed ${to} that their acceptance of the ${docName} is registered, with the signed ${name} attached.`,
    ).catch(() => {});

    return NextResponse.json({ sentTo: to, cc, at: now.toMillis() });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildHtml(p: {
  greetName: string; companyName: string; docName: string; orderNumber: string; when: string; files: number; senderName: string;
}) {
  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:20px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
    <div style="background:#1e3a5f;color:#fff;padding:24px 32px">
      <p style="margin:0;font-size:11px;font-weight:bold;letter-spacing:2px;color:#93c5fd;text-transform:uppercase">Total Transport Logistics</p>
      <h1 style="margin:4px 0 0;font-size:22px;font-weight:bold">Acceptance Registered</h1>
    </div>
    <div style="padding:32px">
      <p style="color:#374151;font-size:15px;margin-top:0">Hello <strong>${esc(p.greetName)}</strong>,</p>
      <p style="color:#374151;font-size:15px">
        We have received your signed ${esc(p.docName)} for shipment <strong>${esc(p.orderNumber)}</strong>
        and registered ${p.companyName ? `<strong>${esc(p.companyName)}</strong>&rsquo;s` : 'your'} acceptance of the agreement.
      </p>
      <p style="color:#374151;font-size:14px;line-height:1.5">
        A copy of the signed agreement is attached to this email${p.files > 1 ? ` (${p.files} files)` : ''} for your records.
      </p>
      <p style="color:#6b7280;font-size:13px">Registered on ${esc(p.when)} by ${esc(p.senderName)}.</p>
      <p style="color:#9ca3af;font-size:12px;text-align:center;margin:28px 0 0">If anything in the attached agreement is not what you agreed to, reply to this email right away.</p>
    </div>
    <div style="border-top:1px solid #e5e7eb;padding:16px 32px;background:#f9fafb">
      <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center">Total Transport Logistics · totaltransportlogistics.us</p>
    </div>
  </div>
</body>
</html>`;
}
