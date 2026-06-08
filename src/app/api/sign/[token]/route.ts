import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { token } = await params;

  const { signerName } = (await req.json()) as { signerName: string };
  if (!signerName?.trim()) {
    return NextResponse.json({ error: 'Signer name is required' }, { status: 400 });
  }

  const tokenRef  = adminDb.collection('signing_tokens').doc(token);
  const tokenSnap = await tokenRef.get();

  if (!tokenSnap.exists) {
    return NextResponse.json({ error: 'Invalid or expired signing link' }, { status: 404 });
  }

  const data = tokenSnap.data()!;

  if (data.usedAt) {
    return NextResponse.json({ error: 'This document has already been signed' }, { status: 409 });
  }

  if (data.expiresAt.toDate() < new Date()) {
    return NextResponse.json({ error: 'This signing link has expired' }, { status: 410 });
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  const now = Timestamp.now();

  await Promise.all([
    tokenRef.update({
      usedAt:     now,
      signerName: signerName.trim(),
      signerIp:   ip,
    }),
    adminDb.collection('orders').doc(data.orderId).update({
      status:            'carrier_signed',
      carrierSignedAt:   now,
      carrierSignerName: signerName.trim(),
      carrierSignerIp:   ip,
      updatedAt:         FieldValue.serverTimestamp(),
    }),
  ]);

  return NextResponse.json({ success: true });
}
