import { NextRequest, NextResponse } from 'next/server';
import { requireCaller } from '@/lib/partyAccess';
import { addReceipts, voidPayment } from '@/lib/providersServer';
import { providerFail } from '@/lib/providerRouteErrors';

type RouteContext = { params: Promise<{ providerId: string; paymentId: string }> };

export const maxDuration = 30;

/** Adds receipts to a payment already recorded, as a form with `receipts` files. */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { providerId, paymentId } = await params;
    const caller = await requireCaller(req);
    const form = await req.formData().catch(() => null);
    await addReceipts(caller, providerId, paymentId, form);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return providerFail(e);
  }
}

/** `{ void: "reason" }` voids the payment. Admin and finance; see voidPayment(). */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { providerId, paymentId } = await params;
    const caller = await requireCaller(req);
    const body = await req.json().catch(() => ({}));
    await voidPayment(caller, providerId, paymentId, body.void);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return providerFail(e);
  }
}
