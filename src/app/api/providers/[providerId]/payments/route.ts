import { NextRequest, NextResponse } from 'next/server';
import { requireCaller } from '@/lib/partyAccess';
import { createPayment, listPayments } from '@/lib/providersServer';
import { providerFail } from '@/lib/providerRouteErrors';

type RouteContext = { params: Promise<{ providerId: string }> };

// Receipts go into the bucket before the transaction; the headroom is for a
// slow phone connection.
export const maxDuration = 30;

/** Every payment to this provider, with signed links to its receipts. Everybody but interns. */
export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { providerId } = await params;
    const caller = await requireCaller(req);
    return NextResponse.json({ payments: await listPayments(caller, providerId) });
  } catch (e) {
    return providerFail(e);
  }
}

/**
 * Records a payment, as a form: the amount, the day, how, the load, and
 * the receipts as files. Uploaded through here rather than from the browser
 * into the bucket so `provider-receipts/` can have no storage rule at all —
 * the same reasoning as load pictures. Pictures are shrunk in the browser
 * first, because Vercel refuses a request over 4.5 MB.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { providerId } = await params;
    const caller = await requireCaller(req);
    const form = await req.formData().catch(() => null);
    return NextResponse.json({ payment: await createPayment(caller, providerId, form) });
  } catch (e) {
    return providerFail(e);
  }
}
