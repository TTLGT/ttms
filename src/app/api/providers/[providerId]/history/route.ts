import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { readHistory } from '@/lib/recordHistory';
import { getProvider } from '@/lib/providersServer';
import { providerFail } from '@/lib/providerRouteErrors';
import { PROVIDERS_COLLECTION } from '@/types/provider';

type RouteContext = { params: Promise<{ providerId: string }> };

/** Everything that has happened to one provider, newest first. Open to whoever can open it. */
export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { providerId } = await params;
    await requireCaller(req);
    await getProvider(providerId);
    const entries = await readHistory(adminDb.collection(PROVIDERS_COLLECTION).doc(providerId), false);
    return NextResponse.json({ entries });
  } catch (e) {
    return providerFail(e);
  }
}
