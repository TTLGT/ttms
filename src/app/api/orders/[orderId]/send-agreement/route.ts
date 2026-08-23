import { NextRequest, NextResponse } from 'next/server';
import { adminDb, requirePermission, AdminAuthError } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import { randomBytes } from 'crypto';
import { dimensionsSummary, orderCommodityItems } from '@/types/order';
import type { Order } from '@/types/order';

type RouteContext = { params: Promise<{ orderId: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    await requirePermission(req, ['dispatcher']);
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

  const carrierSnap = await adminDb.collection('carriers').doc(order.carrierId).get();
  if (!carrierSnap.exists) {
    return NextResponse.json({ error: 'Carrier not found' }, { status: 404 });
  }
  const carrier = carrierSnap.data()!;

  if (!carrier.email) {
    return NextResponse.json({ error: 'Carrier has no email address on file' }, { status: 400 });
  }

  const token      = randomBytes(32).toString('hex');
  const now        = Timestamp.now();
  const expiresAt  = Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  const fmt = (ts: { toDate?: () => Date } | null | undefined) =>
    ts?.toDate?.()?.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) ?? '—';

  const originStr      = [order.origin?.city, order.origin?.state].filter(Boolean).join(', ') || '—';
  const destinationStr = [order.destination?.city, order.destination?.state].filter(Boolean).join(', ') || '—';
  const pickupStr      = fmt(order.pickupDate);
  const deliveryStr    = fmt(order.deliveryDate);
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
    orderNumber:  order.orderNumber,
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
    carrierPay:   order.carrierPay   || 0,
    carrierName:  carrier.companyName,
    driverName:   order.driverName   || '',
    notes:        order.notes        || '',
  });

  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tms.totaltransportlogistics.us';
  const signUrl = `${appUrl}/sign/${token}`;

  await resend.emails.send({
    from:    `TTL Dispatch <${process.env.RESEND_FROM_EMAIL ?? 'noreply@totaltransportlogistics.us'}>`,
    to:      carrier.email,
    subject: `Rate Confirmation — ${order.orderNumber}`,
    html:    buildEmailHtml({
      carrierName:      carrier.companyName,
      orderNumber:      order.orderNumber,
      originStr,
      destinationStr,
      commodity:        order.commodity || '—',
      pickupStr,
      deliveryStr,
      formattedPay:     payStr,
      signUrl,
    }),
  });

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
      <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center">Total Transport Logistics · tms.totaltransportlogistics.us</p>
    </div>
  </div>
</body>
</html>`;
}
