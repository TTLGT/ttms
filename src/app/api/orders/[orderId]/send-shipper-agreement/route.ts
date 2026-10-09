import { NextRequest, NextResponse } from 'next/server';
import { formatLongDateRange } from '@/lib/dateFormat';
import { adminDb, requirePermission, AdminAuthError } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import { agreementSentAlert, postOrderAlert } from '@/lib/chatAlerts';
import { actorForUid, recordEvent } from '@/lib/recordHistory';
import { saRequestRef } from '@/lib/saRequestsServer';
import { outstandingChecks } from '@/types/saRequest';
import { signUrl } from '@/lib/appUrl';
import { currentClientTerms } from '@/lib/agreementTermsServer';
import { clientAgreementRef, planAgreementHold, type ClientAgreementPointer } from '@/lib/clientAgreements';
import {
  changedSections, confirmationContent, contentHash, sectionHashes, sectionList, tokenSnapshotFields,
} from '@/lib/loadConfirmationServer';
import { qrPng } from '@/lib/qrCode';
import { generateQuoteBuffer } from '@/lib/quote-pdf';
import { buildQuoteData } from '@/lib/quoteData';
import { randomBytes } from 'crypto';
import { orderDisplayNumber } from '@/types/order';
import type { Order } from '@/types/order';

type RouteContext = { params: Promise<{ orderId: string }> };

// A PDF render and an email with two attachments. The headroom is a cold start.
export const maxDuration = 30;

/** The QR code's name inside the email — the `cid:` the HTML points at. */
const QR_CONTENT_ID = 'sign-qr';

/** How long a link works after each send. Every send, resend or revision restarts it. */
const LINK_DAYS = 7;

/**
 * - `new`      — the first link for this load (or for a new client on it).
 * - `resend`   — nothing the client agreed to has changed: the same link,
 *                emailed again, with its clock restarted.
 * - `revision` — the order changed and dispatch has reviewed it: the same
 *                link now shows the new version. See src/lib/clientAgreements.ts.
 */
type SendKind = 'new' | 'resend' | 'revision';

/** The fields a signature writes on the link, cleared when it is revised. */
const LINK_SIGNATURE_RESET = {
  usedAt: null, signerName: null, signerIp: null, signerUserAgent: null, signerDevice: null,
  signerTitle: null, esignConsent: null, termsAccepted: null, signedVersion: null,
};

export async function POST(req: NextRequest, { params }: RouteContext) {
  let caller: { uid: string; email: string | undefined };
  try {
    caller = await requirePermission(req, 'orders.sendAgreement');
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Email sending is not configured' }, { status: 503 });
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { orderId } = await params;

  const orderSnap = await adminDb.collection('orders').doc(orderId).get();
  if (!orderSnap.exists) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  const order = orderSnap.data()!;

  /*
   * The load confirmation goes to the **client**, not the shipper.
   *
   * It quotes the agreed rate — what the client pays us — so it was never a
   * document a shipper should have been holding. It went to `shipperId` for
   * years, which put our client's rate in a facility's inbox on every load.
   * The stored field is still called `shipperSignedAt` because live orders
   * carry it; only the recipient and the wording changed.
   */
  if (!order.clientId) {
    return NextResponse.json({ error: 'No client on this order' }, { status: 400 });
  }

  const clientSnap = await adminDb.collection('parties').doc(order.clientId).get();
  if (!clientSnap.exists) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }
  const client = clientSnap.data()!;

  // Prefer a named contact, but fall back to the address on the party record so
  // a client created inline from an order can still be sent an agreement.
  const contacts: { name: string; email: string }[] = client.contacts ?? [];
  const contact =
    contacts.find((c) => c.email?.trim()) ??
    (client.email?.trim()
      ? { name: client.contactName || client.companyName || '', email: client.email.trim() }
      : null);
  if (!contact) {
    return NextResponse.json({ error: 'Client has no email address on file' }, { status: 400 });
  }

  /*
   * The review comes before the send when somebody asked for it.
   *
   * A load that went through "Request SA" has a review list dispatch works
   * through; sending before it is finished is the one thing that list exists
   * to stop, so it is refused here rather than only greyed out on screen. A
   * load with no request — older orders, or one dispatch is handling directly
   * — sends exactly as it always did.
   */
  const saRequest = await saRequestRef(orderId).get();
  const saStatus = saRequest.exists ? saRequest.data()!.status : null;
  if (saStatus === 'open') {
    const left = outstandingChecks(saRequest.data()!.checks ?? {}, Boolean(order.carrierId || order.carrierName));
    if (left.length > 0) {
      return NextResponse.json(
        { error: `Finish the review first: ${left.map((c) => c.label.toLowerCase()).join(', ')}.` },
        { status: 409 },
      );
    }
  }

  const now       = Timestamp.now();
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + LINK_DAYS * 24 * 60 * 60 * 1000));
  const actor     = await actorForUid(caller.uid, caller.email).catch(() => null);
  const orderNumber = orderDisplayNumber(order);

  /*
   * Which of the three sends this is, decided by comparing what the order says
   * now with what the link last showed. See src/lib/clientAgreements.ts.
   */
  const content  = confirmationContent(order as Partial<Order> & Record<string, unknown>);
  const sections = sectionHashes(content);
  const hash     = contentHash(sections);

  const pointerRef  = clientAgreementRef(orderId);
  const pointerSnap = await pointerRef.get();
  const pointer     = pointerSnap.exists ? (pointerSnap.data() as ClientAgreementPointer) : null;
  const tokenSnap   = pointer?.token && !pointer.clientChanged
    ? await adminDb.collection('signing_tokens').doc(pointer.token).get()
    : null;
  const current     = tokenSnap?.exists ? tokenSnap.data()! : null;

  const signedCurrent = Boolean(pointer && pointer.signedVersion != null && pointer.signedVersion === pointer.version);

  let kind: SendKind;
  if (!pointer || !current || current.revokedAt) {
    kind = 'new';
  } else if (hash === pointer.contentHash && !signedCurrent) {
    kind = 'resend';
  } else if (hash === pointer.contentHash && !pointer.heldAt) {
    return NextResponse.json({ error: 'The client has already signed this agreement.' }, { status: 409 });
  } else if (hash === pointer.contentHash) {
    /*
     * Signed, changed (which cleared the order's signature), then changed
     * back. The content is what they signed, but the order no longer records
     * that signature, so they sign it again as a new version rather than the
     * link claiming a signature the order does not show. Nothing new to
     * review — it is the content that was reviewed and signed before.
     */
    kind = 'revision';
  } else {
    /*
     * A change, so it must have been reviewed. An order save that changes the
     * agreement opens a request itself (planAgreementHold); one that reaches
     * here with no open request was sent back, or came in some other way. The
     * review is reopened rather than skipped, and nothing is sent.
     */
    if (saStatus !== 'open') {
      const hold = await planAgreementHold(
        orderId, order, actor ?? { uid: caller.uid, name: caller.email ?? 'Dispatch', email: caller.email ?? '', via: 'app' },
        now, true,
      );
      if (hold) {
        const batch = adminDb.batch();
        const orderWrite: Record<string, unknown> = {};
        hold.apply(batch, orderWrite);
        if (Object.keys(orderWrite).length) batch.update(orderSnap.ref, orderWrite);
        await batch.commit();
        await hold.afterCommit();
      }
      const what = sectionList(changedSections(pointer.sectionHashes, sections));
      return NextResponse.json({
        error: `The order has changed since the SA was sent${what ? ` (${what})` : ''}. `
          + 'A review has been opened. Finish it, then send the update.',
      }, { status: 409 });
    }
    kind = 'revision';
  }

  const token = kind === 'new' ? randomBytes(32).toString('hex') : pointer!.token;
  const link  = signUrl(token);
  const changed = kind === 'revision' ? sectionList(changedSections(pointer!.sectionHashes, sections)) : '';

  /*
   * Everything that can fail is built before anything is written or sent: the
   * terms, the QR code and the quote PDF. An email that went out without its
   * quote, or a link naming terms nobody could read, would be worse than a
   * send that fails and is tried again.
   */
  const terms = kind === 'resend' ? null : await currentClientTerms();
  const qr    = await qrPng(link);
  const quote = await generateQuoteBuffer({
    ...(await buildQuoteData(order as Partial<Order> & Record<string, unknown>, {
      name:  actor?.name ?? caller.email ?? 'Total Transport Logistics',
      email: caller.email ?? '',
    })),
    signQr: `data:image/png;base64,${qr.toString('base64')}`,
    signLink: link,
  });

  const snapshotFields = tokenSnapshotFields(order as Partial<Order> & Record<string, unknown>, content);
  const snapshot = {
    ...snapshotFields,
    orderNumber,
    clientName:   client.companyName || client.contactName,
    clientEmail:  contact.email,
    sentByName:   actor?.name ?? '',
    sentByEmail:  caller.email ?? '',
    contentHash:  hash,
    heldAt:       null,
    expiresAt,
    lastSentAt:   now,
  };

  const tokenRef = adminDb.collection('signing_tokens').doc(token);
  const batch = adminDb.batch();
  const version = kind === 'new' ? 1 : kind === 'revision' ? Number(current!.version ?? 1) + 1 : Number(current!.version ?? 1);

  if (kind === 'new') {
    batch.set(tokenRef, {
      ...snapshot,
      orderId,
      clientId:     order.clientId,
      // The token type is unchanged: live unsigned links carry it, and the sign
      // route branches on it. It names the field it writes, not the recipient.
      type:         'shipper_agreement',
      createdAt:    now,
      ...LINK_SIGNATURE_RESET,
      version,
      /*
       * The terms as they stand now, copied in full. This is what the client
       * accepts, and it must stay what they were sent even if the setting is
       * rewritten before they open the link. See src/types/agreementTerms.ts.
       */
      termsText:      terms!.text,
      termsUpdatedAt: terms!.updatedAt,
    });
  } else if (kind === 'resend') {
    // Only the clock, the recipient and who sent it. The content, the terms
    // and the version are what the client was already sent.
    batch.update(tokenRef, {
      clientEmail: contact.email,
      sentByName:  snapshot.sentByName,
      sentByEmail: snapshot.sentByEmail,
      heldAt:      null,
      expiresAt,
      lastSentAt:  now,
    });
  } else {
    /*
     * The old version goes into the link's history first — content, terms
     * and, if the client had signed it, the whole signature record — so the
     * legal trail of what was shown and signed survives the link being
     * reused. Then the link takes the new content and is unsigned again.
     */
    batch.set(tokenRef.collection('versions').doc(String(current!.version ?? 1)), {
      ...current,
      supersededAt: now,
      supersededBy: actor?.name ?? caller.email ?? '',
    });
    batch.update(tokenRef, {
      ...snapshot,
      ...LINK_SIGNATURE_RESET,
      clientId:       order.clientId,
      version,
      termsText:      terms!.text,
      termsUpdatedAt: terms!.updatedAt,
      revisedAt:      now,
      previousSentAt: current!.lastSentAt ?? current!.createdAt ?? null,
      changedSections: changed,
    });
  }

  batch.set(pointerRef, {
    token,
    version,
    contentHash: hash,
    sectionHashes: sections,
    heldAt: null,
    pendingHash: null,
    clientChanged: false,
    signedVersion: kind === 'resend' ? (pointer!.signedVersion ?? null) : null,
    sentAt: now,
    sentTo: contact.email,
  });
  await batch.commit();

  const sent = await resend.emails.send({
    from:    `TTL Dispatch <${process.env.RESEND_FROM_EMAIL ?? 'noreply@totaltransportlogistics.us'}>`,
    to:      contact.email,
    subject: kind === 'revision' ? `Updated Load Confirmation — ${orderNumber}` : `Load Confirmation — ${orderNumber}`,
    html:    buildEmailHtml({
      kind,
      changed,
      contactName:  contact.name || client.companyName,
      orderNumber,
      originStr:      String(snapshotFields.originStr),
      destinationStr: String(snapshotFields.destinationStr),
      commodity:    order.commodity || '—',
      // A window when dispatch gave one — a client held to a single day it was
      // never promised is how a load gets refused at the dock.
      pickupStr:    formatLongDateRange(order.pickupDate, order.pickupDateEnd),
      deliveryStr:  formatLongDateRange(order.deliveryDate, order.deliveryDateEnd),
      formattedRate: order.agreedRate
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(order.agreedRate)
        : '—',
      signUrl: link,
    }),
    attachments: [
      { filename: `Quote ${orderNumber.replace(/[\\/:*?"<>|]/g, '-')}.pdf`, content: quote, contentType: 'application/pdf' },
      // Inline, by content id: Gmail and Outlook both refuse an image written
      // into the HTML as a data: URL, and an image fetched from our own site
      // would be blocked by default in most inboxes until the client clicked
      // "show images".
      { filename: 'scan-to-sign.png', content: qr, contentType: 'image/png', contentId: QR_CONTENT_ID },
    ],
  });

  // Resend reports a refused send in the result rather than by throwing. Said
  // out loud here, because everything below records that the email went out.
  // The link is already in its new state; pressing Send again is a resend of
  // it, which is exactly what should happen.
  if (sent.error) {
    return NextResponse.json({ error: `The email could not be sent: ${sent.error.message}` }, { status: 502 });
  }

  const what =
    kind === 'revision' ? `Emailed the updated load confirmation (version ${version}, changed: ${changed}), with the quote PDF, to the client at ${contact.email}`
    : kind === 'resend' ? `Emailed the load confirmation again, same link, to the client at ${contact.email}`
    : `Emailed the load confirmation, with the quote PDF, to the client at ${contact.email}`;

  // After the send, never before: an entry saying it went out must mean it
  // did. Best-effort for the same reason as the alert — the email has left,
  // and failing the request now would invite somebody to send it twice.
  await recordEvent(adminDb.collection('orders').doc(orderId), what, await actorForUid(caller.uid, caller.email)).catch(() => {});

  if (saStatus === 'open') {
    await saRequestRef(orderId).update({
      status: 'sent',
      sentAt: now,
      sentByName: actor?.name ?? caller.email ?? 'Dispatch',
      sentTo: contact.email,
    }).catch(() => {});
  }

  // The signing link goes in the room as well as in the email, so whoever is
  // on the phone with the client can open exactly what they were sent. It is
  // the client's link: everybody in this room is staff who can already see
  // the load, and a signature made from it records the device and address it
  // came from, so it could not pass for the client's own.
  const line =
    kind === 'revision' ? `The updated load confirmation (version ${version}) was emailed to ${contact.email}. Same link and QR code; it now shows the update.`
    : kind === 'resend' ? `The load confirmation was emailed again to ${contact.email}, same link.`
    : agreementSentAlert('client', contact.email);
  await postOrderAlert(orderId, `${line}${actor ? ` Sent by ${actor.name}.` : ''} E-signature link: ${link}`).catch(() => {});

  return NextResponse.json({ success: true, sentTo: contact.email, kind, version });
}

/**
 * Order values go into HTML, and a client called "Smith & Sons" or a note with
 * a "<" in it should read as written rather than break the email.
 */
function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildEmailHtml(p: {
  kind: SendKind;
  changed: string;
  contactName: string;
  orderNumber: string;
  originStr: string;
  destinationStr: string;
  commodity: string;
  pickupStr: string;
  deliveryStr: string;
  formattedRate: string;
  signUrl: string;
}) {
  const row = (label: string, value: string, bg = '#ffffff') =>
    `<tr style="background:${bg}">
      <td style="padding:10px 16px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;width:120px">${label}</td>
      <td style="padding:10px 16px;font-size:14px;color:#111827;font-weight:500">${esc(value)}</td>
    </tr>`;

  const intro = p.kind === 'revision'
    ? `We have updated the load confirmation for shipment <strong>${esc(p.orderNumber)}</strong>${p.changed ? ` (changed: ${esc(p.changed)})` : ''}. It replaces the version we sent before, so please review it again and sign. The link and QR code are the same as before and now show the updated agreement. Your updated quote is attached as a PDF.`
    : `Please review and sign the load confirmation for shipment <strong>${esc(p.orderNumber)}</strong>. Your quote is attached to this email as a PDF.`;

  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:20px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
    <div style="background:#1e3a5f;color:#fff;padding:24px 32px">
      <p style="margin:0;font-size:11px;font-weight:bold;letter-spacing:2px;color:#93c5fd;text-transform:uppercase">Total Transport Logistics</p>
      <h1 style="margin:4px 0 0;font-size:22px;font-weight:bold">${p.kind === 'revision' ? 'Updated Load Confirmation' : 'Load Confirmation'}</h1>
    </div>
    <div style="padding:32px">
      <p style="color:#374151;font-size:15px;margin-top:0">Hello <strong>${esc(p.contactName)}</strong>,</p>
      <p style="color:#374151;font-size:15px">${intro}</p>
      <table style="width:100%;border-collapse:collapse;margin:24px 0;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden">
        ${row('From',      p.originStr,      '#f9fafb')}
        ${row('To',        p.destinationStr, '#ffffff')}
        ${row('Commodity', p.commodity,      '#f9fafb')}
        ${row('Pickup',    p.pickupStr,      '#ffffff')}
        ${row('Delivery',  p.deliveryStr,    '#f9fafb')}
        <tr style="background:#fff">
          <td style="padding:10px 16px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:1px">Agreed Rate</td>
          <td style="padding:10px 16px;font-size:18px;color:#111827;font-weight:700">${esc(p.formattedRate)}</td>
        </tr>
      </table>
      <p style="color:#374151;font-size:14px;line-height:1.5">The link below opens the full agreement: the rate, every pickup and delivery address with its dates, the freight, how payment is made, and our terms and conditions. You sign it there by typing your name.</p>
      <div style="text-align:center;margin:28px 0">
        <a href="${p.signUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 48px;border-radius:8px;font-size:16px;font-weight:bold">
          Review &amp; Sign →
        </a>
      </div>
      <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 24px;border:1px solid #e5e7eb;border-radius:6px">
        <tr>
          <td style="padding:16px;width:160px;vertical-align:middle">
            <img src="cid:${QR_CONTENT_ID}" width="140" height="140" alt="QR code for the signing page" style="display:block;width:140px;height:140px;border:0" />
          </td>
          <td style="padding:16px 16px 16px 0;vertical-align:middle">
            <p style="margin:0 0 4px;font-size:14px;font-weight:bold;color:#111827">On your phone?</p>
            <p style="margin:0;font-size:13px;color:#4b5563;line-height:1.5">Scan this code with your phone&rsquo;s camera to open the same agreement and sign it there.</p>
          </td>
        </tr>
      </table>
      <p style="color:#9ca3af;font-size:12px;text-align:center;margin-bottom:0">This link expires in ${LINK_DAYS} days. If you have any questions, reply to this email or contact your dispatcher.</p>
    </div>
    <div style="border-top:1px solid #e5e7eb;padding:16px 32px;background:#f9fafb">
      <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center">Total Transport Logistics · totaltransportlogistics.us</p>
    </div>
  </div>
</body>
</html>`;
}
