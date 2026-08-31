import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage, requirePermission, AdminAuthError } from '@/lib/firebase-admin';
import { documentAlert, postOrderAlert } from '@/lib/chatAlerts';
import { generateInvoiceBuffer } from '@/lib/invoice-pdf';
import type { InvoiceData } from '@/lib/invoice-pdf';
import { orderDisplayNumber } from '@/types/order';

type RouteContext = { params: Promise<{ orderId: string }> };

const fmtDate = (ts: { toDate?: () => Date } | null | undefined): string => {
  if (!ts || typeof ts.toDate !== 'function') return '—';
  return ts.toDate().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

/**
 * Handed straight back to whoever asked for the generation. Reading an
 * *existing* invoice goes through /api/orders/{id}/document instead, which
 * checks order ownership — this route is finance-and-admin only.
 */
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

  const data: InvoiceData = {
    // The number the load is known by, which for a BATS-era order is its BATS
    // id — see orderDisplayNumber(). A document must carry what the carrier
    // and the client already have on file for this load.
    invoiceNumber:     orderDisplayNumber(order),
    invoiceDate:       new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    clientName:       order.clientName    ?? '',
    consigneeName:    order.consigneeName ?? '',
    shipperName:       order.shipperName          ?? '',
    commodity:         order.commodity            ?? '',
    pieces:            order.pieces               ?? 0,
    weight:            order.weight               ?? 0,
    originCity:        order.origin?.city         ?? '',
    originState:       order.origin?.state        ?? '',
    destCity:          order.destination?.city    ?? '',
    destState:         order.destination?.state   ?? '',
    pickupDate:        fmtDate(order.pickupDate),
    deliveryDate:      fmtDate(order.deliveryDate),
    agreedRate:        order.agreedRate           ?? 0,
    notes:             order.notes                ?? '',
    shipperSignerName: order.shipperSignerName    ?? null,
    shipperSignedAt:   order.shipperSignedAt ? fmtDate(order.shipperSignedAt) : null,
    shipperSignerIp:   order.shipperSignerIp      ?? null,
    generatedAt:       new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
  };

  const buffer   = await generateInvoiceBuffer(data);
  const filePath = `invoices/${orderId}.pdf`;

  await adminStorage.bucket().file(filePath).save(buffer, {
    metadata: { contentType: 'application/pdf' },
  });

  await adminDb.collection('orders').doc(orderId).update({
    invoiceStoragePath: filePath,
    updatedAt:          new Date(),
  });

  // Best-effort, like the BOL: the invoice is generated either way.
  await postOrderAlert(orderId, documentAlert('Invoice', true)).catch(() => {});

  const url = await getSignedUrl(filePath);
  return NextResponse.json({ url, path: filePath });
}
