import { NextRequest, NextResponse } from 'next/server';
import { formatLongDateRange } from '@/lib/dateFormat';
import { adminDb, requirePermission, AdminAuthError } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import { agreementSentAlert, postOrderAlert } from '@/lib/chatAlerts';
import { actorForUid, recordEvent } from '@/lib/recordHistory';
import { signUrl } from '@/lib/appUrl';
import { randomBytes } from 'crypto';
import {
  archiveRound, buildSaReview, freezeReview, requestRef, roundRef, saGateFactsFor, sendEntry,
} from '@/lib/saRequestsServer';
import { cleanCcList, outstandingChecks } from '@/types/saRequest';
import { clientSignatureSatisfied, dimensionsSummary, orderCommodityItems, orderDeliveries, orderDisplayNumber, orderPickups, stopPlaces } from '@/types/order';
import type { Order } from '@/types/order';

type RouteContext = { params: Promise<{ orderId: string }> };

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

  if (!order.carrierId) {
    return NextResponse.json({ error: 'No carrier assigned to this order' }, { status: 400 });
  }

  /*
   * The client signs first.
   *
   * A rate confirmation is a commitment to pay a carrier for a load the client
   * has not yet agreed to pay us for, so it does not leave the building until
   * the load confirmation comes back signed — or until somebody holding
   * `orders.waiveSignature` has deliberately decided to dispatch without it.
   *
   * Checked here and not only on the screen: the button is the courtesy, this
   * is the rule. The route is reachable by anybody who can send agreements.
   */
  if (!clientSignatureSatisfied(order)) {
    return NextResponse.json(
      {
        error:
          'The client has not signed the load confirmation yet. Send it for signature first, ' +
          'or dispatch without a signature if you have that permission.',
        needsClientSignature: true,
      },
      { status: 409 },
    );
  }

  const carrierSnap = await adminDb.collection('carriers').doc(order.carrierId).get();
  if (!carrierSnap.exists) {
    return NextResponse.json({ error: 'Carrier not found' }, { status: 404 });
  }
  const carrier = carrierSnap.data()!;

  if (!carrier.email) {
    return NextResponse.json({ error: 'Carrier has no email address on file' }, { status: 400 });
  }

  /*
   * The carrier review comes before the send when a broker asked for it —
   * the same rule as the SA's (see src/lib/agreementRequestRoutes.ts). An
   * open Carrier Agreement request with unticked items is refused here, not
   * only greyed out. A load with no request sends as it always did.
   */
  const caSnap = await requestRef('carrier', orderId).get();
  const ca = caSnap.exists ? caSnap.data()! : null;
  if (ca?.status === 'open') {
    const left = outstandingChecks('carrier', ca.checks ?? {}, await saGateFactsFor(orderId, order, carrier));
    if (left.length > 0) {
      return NextResponse.json(
        { error: `Finish the carrier review first: ${left.map((c) => c.label.toLowerCase()).join(', ')}.` },
        { status: 409 },
      );
    }
  }
  // Who else the agreement is copied to — set by dispatch on the review.
  // Never the carrier's own address twice.
  const cc = cleanCcList(ca?.ccEmails).filter((e) => e !== String(carrier.email).trim().toLowerCase());

  /*
   * Each send of the carrier's agreement is its own link (unlike the
   * client's, which is revised in place), so each is numbered: the nth link
   * for this load is version n. One equality filter and the type in memory —
   * no composite index.
   */
  const earlier = await adminDb.collection('signing_tokens').where('orderId', '==', orderId).get();
  const version = earlier.docs.filter((d) => d.data().type === 'carrier_agreement').length + 1;
  const actor   = await actorForUid(caller.uid, caller.email).catch(() => null);

  const token      = randomBytes(32).toString('hex');
  const now        = Timestamp.now();
  const expiresAt  = Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  // Every pickup and every delivery, in order — a load with extra stops lists
  // them all rather than quoting only the first of each.
  const originStr      = stopPlaces(orderPickups(order)) || '—';
  const destinationStr = stopPlaces(orderDeliveries(order)) || '—';
  // A window when dispatch gave one — a carrier held to a single day it was
  // never promised is how a load gets refused at the dock.
  const pickupStr      = formatLongDateRange(order.pickupDate, order.pickupDateEnd);
  const deliveryStr    = formatLongDateRange(order.deliveryDate, order.deliveryDateEnd);
  const payStr         = order.carrierPay
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(order.carrierPay)
    : '—';

  await adminDb.collection('signing_tokens').doc(token).set({
    orderId,
    carrierId:    order.carrierId,
    carrierEmail: carrier.email,
    type:         'carrier_agreement',
    createdAt:    now,
    expiresAt,
    usedAt:       null,
    signerName:   null,
    signerIp:     null,
    // What the carrier and client already have on file for this load — a
    // BATS-era order goes out under its BATS id. See orderDisplayNumber().
    orderNumber:  orderDisplayNumber(order),
    commodity:    order.commodity || '',
    weight:       order.weight    || 0,
    pieces:       order.pieces    || 0,
    // Snapshotted with the rest of the load: what the carrier signed against
    // must not shift if the order is edited afterwards.
    dimensions:   dimensionsSummary(orderCommodityItems(order as Partial<Order>)),
    originStr,
    destinationStr,
    pickupDate:   order.pickupDate   || null,
    deliveryDate: order.deliveryDate || null,
    pickupDateEnd:   order.pickupDateEnd   || null,
    deliveryDateEnd: order.deliveryDateEnd || null,
    carrierPay:   order.carrierPay   || 0,
    carrierName:  carrier.companyName,
    driverName:   order.driverName   || '',
    notes:        order.notes        || '',
    version,
    cc,
    sentByName:   actor?.name ?? '',
    sentByEmail:  caller.email ?? '',
    lastSentAt:   now,
  });

  const link = signUrl(token);

  const sent = await resend.emails.send({
    from:    `TTL Dispatch <${process.env.RESEND_FROM_EMAIL ?? 'noreply@totaltransportlogistics.us'}>`,
    to:      carrier.email,
    ...(cc.length ? { cc } : {}),
    subject: `Rate Confirmation — ${orderDisplayNumber(order)}`,
    html:    buildEmailHtml({
      carrierName:      carrier.companyName,
      orderNumber:      orderDisplayNumber(order),
      originStr,
      destinationStr,
      commodity:        order.commodity || '—',
      pickupStr,
      deliveryStr,
      formattedPay:     payStr,
      signUrl: link,
    }),
  });
  // Resend reports a refused send in the result rather than by throwing.
  // Said out loud, because everything below records that the email went out.
  if (sent.error) {
    return NextResponse.json({ error: `The email could not be sent: ${sent.error.message}` }, { status: 502 });
  }

  // Said in the room so that "has anybody sent the rate con yet" stops being
  // a question. Best-effort: the email has already left.
  // After the send, never before: an entry saying it went out must mean it
  // did. Best-effort for the same reason as the alert — the email has left,
  // and failing the request now would invite somebody to send it twice.
  await recordEvent(
    adminDb.collection('orders').doc(orderId),
    `Emailed the carrier agreement (version ${version}) to the carrier at ${carrier.email}${cc.length ? `, copied to ${cc.join(', ')}` : ''}`,
    actor ?? await actorForUid(caller.uid, caller.email),
  ).catch(() => {});

  await postOrderAlert(orderId, `${agreementSentAlert('carrier', carrier.email)}${cc.length ? ` Copied to ${cc.join(', ')}.` : ''}`).catch(() => {});

  await recordCarrierSend().catch(() => {});

  /**
   * The send goes into the load's carrier verification record, the same way
   * the SA's does (see recordSend in send-shipper-agreement): which version,
   * to whom, by whom, and on the round's first send a frozen copy of what the
   * reviewer was looking at. A send with no review open is a round of its own.
   */
  async function recordCarrierSend() {
    const sentByName = actor?.name ?? caller.email ?? 'Dispatch';
    const send = sendEntry({ byName: sentByName, sentTo: carrier.email, cc, version, kind: 'new' }, now);
    const frozen = await buildSaReview(orderId, order, false, 'carrier').then(freezeReview).catch(() => null);
    const reqRef = requestRef('carrier', orderId);
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(reqRef);
      const d = snap.exists ? snap.data()! : null;
      if (d && (d.status === 'open' || d.status === 'sent' || d.status === 'done')) {
        const first = d.status === 'open';
        const patch: Record<string, unknown> = {
          ...(first ? {
            status: 'sent', sentAt: now, sentByName, sentTo: carrier.email, sentCc: cc,
            saVersion: version, dispatched: frozen,
          } : {}),
          sends: [...(Array.isArray(d.sends) ? d.sends : []), send],
        };
        tx.update(reqRef, patch);
        archiveRound(tx, 'carrier', orderId, { ...d, ...patch });
        return;
      }
      tx.set(roundRef('carrier', orderId, `direct-${now.toMillis()}`), {
        party: 'carrier',
        kind: 'direct',
        roundId: `direct-${now.toMillis()}`,
        orderId,
        orderNumber: orderDisplayNumber(order),
        clientName: String(order.clientName ?? ''),
        carrierName: String(carrier.companyName ?? ''),
        status: 'sent',
        note: '',
        requestedByName: sentByName,
        requestedAt: now,
        checks: {},
        sentAt: now, sentByName, sentTo: carrier.email, sentCc: cc,
        saVersion: version,
        dispatched: frozen,
        sends: [send],
        archivedAt: now,
      });
    });
  }

  return NextResponse.json({ success: true, sentTo: carrier.email });
}

function buildEmailHtml(p: {
  carrierName: string;
  orderNumber: string;
  originStr: string;
  destinationStr: string;
  commodity: string;
  pickupStr: string;
  deliveryStr: string;
  formattedPay: string;
  signUrl: string;
}) {
  const row = (label: string, value: string, bg = '#ffffff') =>
    `<tr style="background:${bg}">
      <td style="padding:10px 16px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;width:120px">${label}</td>
      <td style="padding:10px 16px;font-size:14px;color:#111827;font-weight:500">${value}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:20px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
    <div style="background:#1e3a5f;color:#fff;padding:24px 32px">
      <p style="margin:0;font-size:11px;font-weight:bold;letter-spacing:2px;color:#93c5fd;text-transform:uppercase">Total Transport Logistics</p>
      <h1 style="margin:4px 0 0;font-size:22px;font-weight:bold">Rate Confirmation</h1>
    </div>
    <div style="padding:32px">
      <p style="color:#374151;font-size:15px;margin-top:0">Hello <strong>${p.carrierName}</strong>,</p>
      <p style="color:#374151;font-size:15px">Please review and sign the rate confirmation for load <strong>${p.orderNumber}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:24px 0;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden">
        ${row('From',      p.originStr,      '#f9fafb')}
        ${row('To',        p.destinationStr, '#ffffff')}
        ${row('Commodity', p.commodity,      '#f9fafb')}
        ${row('Pickup',    p.pickupStr,      '#ffffff')}
        ${row('Delivery',  p.deliveryStr,    '#f9fafb')}
        <tr style="background:#fff">
          <td style="padding:10px 16px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:1px">Carrier Pay</td>
          <td style="padding:10px 16px;font-size:18px;color:#111827;font-weight:700">${p.formattedPay}</td>
        </tr>
      </table>
      <div style="text-align:center;margin:32px 0">
        <a href="${p.signUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 48px;border-radius:8px;font-size:16px;font-weight:bold">
          Review &amp; Sign →
        </a>
      </div>
      <p style="color:#9ca3af;font-size:12px;text-align:center;margin-bottom:0">This link expires in 7 days. If you have any questions, reply to this email or contact your dispatcher.</p>
    </div>
    <div style="border-top:1px solid #e5e7eb;padding:16px 32px;background:#f9fafb">
      <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center">Total Transport Logistics · totaltransportlogistics.us</p>
    </div>
  </div>
</body>
</html>`;
}
