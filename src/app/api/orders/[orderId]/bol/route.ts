import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage, requirePermission, requireCompanyUser, AdminAuthError } from '@/lib/firebase-admin';
import { generateBolBuffer } from '@/lib/bol-pdf';
import type { BolData } from '@/lib/bol-pdf';
import { formatDimensions, itemWeightLb, orderCommodityItems } from '@/types/order';
import type { Order } from '@/types/order';

type RouteContext = { params: Promise<{ orderId: string }> };

const fmtDate = (ts: { toDate?: () => Date } | null | undefined): string => {
  if (!ts || typeof ts.toDate !== 'function') return '—';
  return ts.toDate().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

async function getSignedUrl(filePath: string): Promise<string> {
  const [url] = await adminStorage.bucket().file(filePath).getSignedUrl({
    action: 'read',
    expires: Date.now() + 2 * 60 * 60 * 1000,
  });
  return url;
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    await requirePermission(req, ['finance']);
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const { orderId } = await params;

  const orderSnap = await adminDb.collection('orders').doc(orderId).get();
  if (!orderSnap.exists) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  const order = orderSnap.data()!;

  let carrierDot = '';
  let carrierMc  = '';
  if (order.carrierId) {
    const carrierSnap = await adminDb.collection('carriers').doc(order.carrierId).get();
    if (carrierSnap.exists) {
      const c = carrierSnap.data()!;
      carrierDot = c.dot ?? '';
      carrierMc  = c.mc  ?? '';
    }
  }

  // Phone numbers live on the party records, not the order.
  const [shipperPhone, consigneePhone] = await Promise.all([
    partyPhone(order.shipperId),
    partyPhone(order.consigneeId),
  ]);

  const data: BolData = {
    orderNumber:      order.orderNumber        ?? '',
    clientName:       order.clientName         ?? '',
    shipperName:      order.shipperName        ?? '',
    shipperPhone,
    consigneeName:    order.consigneeName      ?? '',
    consigneePhone,
    carrierName:      order.carrierName        ?? '',
    carrierDot,
    carrierMc,
    driverName:       order.driverName         ?? '',
    driverPhone:      order.driverPhone        ?? '',
    commodity:        order.commodity          ?? '',
    pieces:           order.pieces             ?? 0,
    weight:           order.weight             ?? 0,
    items:            orderCommodityItems(order as Partial<Order>).map((it) => ({
      description: it.description,
      quantity:    it.quantity ? String(it.quantity) : '',
      dimensions:  formatDimensions(it),
      weight:      itemWeightLb(it) ? `${Math.round(itemWeightLb(it)).toLocaleString()} lbs` : '',
    })),
    originStreet:     order.origin?.street     ?? '',
    originCity:       order.origin?.city       ?? '',
    originState:      order.origin?.state      ?? '',
    originZip:        order.origin?.zip        ?? '',
    destStreet:       order.destination?.street ?? '',
    destCity:         order.destination?.city  ?? '',
    destState:        order.destination?.state ?? '',
    destZip:          order.destination?.zip   ?? '',
    pickupDate:       fmtDate(order.pickupDate),
    deliveryDate:     fmtDate(order.deliveryDate),
    agreedRate:       order.agreedRate         ?? 0,
    brokerFee:        order.brokerFee          ?? 0,
    carrierPay:       order.carrierPay         ?? 0,
    notes:            order.notes              ?? '',
    carrierSignerName: order.carrierSignerName ?? null,
    carrierSignedAt:   order.carrierSignedAt ? fmtDate(order.carrierSignedAt) : null,
    carrierSignerIp:   order.carrierSignerIp  ?? null,
    generatedAt:       new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
  };

  const buffer   = await generateBolBuffer(data);
  const filePath = `bols/${orderId}.pdf`;

  await adminStorage.bucket().file(filePath).save(buffer, {
    metadata: { contentType: 'application/pdf' },
  });

  await adminDb.collection('orders').doc(orderId).update({
    bolStoragePath: filePath,
    updatedAt:      new Date(),
  });

  const url = await getSignedUrl(filePath);
  return NextResponse.json({ url, path: filePath });
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    await requireCompanyUser(req);
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const { orderId } = await params;

  const orderSnap = await adminDb.collection('orders').doc(orderId).get();
  if (!orderSnap.exists) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const order = orderSnap.data()!;
  if (!order.bolStoragePath) return NextResponse.json({ error: 'No BOL generated yet' }, { status: 404 });

  const url = await getSignedUrl(order.bolStoragePath as string);
  return NextResponse.json({ url, path: order.bolStoragePath });
}

async function partyPhone(partyId: string | undefined | null): Promise<string> {
  if (!partyId) return '';
  const snap = await adminDb.collection('parties').doc(partyId).get();
  return snap.exists ? (snap.data()!.phone ?? '') : '';
}
