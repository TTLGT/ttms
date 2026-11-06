import { NextRequest, NextResponse } from 'next/server';
import { requireCaller } from '@/lib/partyAccess';
import { getProvider, updateProvider } from '@/lib/providersServer';
import { providerFail } from '@/lib/providerRouteErrors';

type RouteContext = { params: Promise<{ providerId: string }> };

/** One provider, to anybody signed in, like the directory. */
export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { providerId } = await params;
    await requireCaller(req);
    return NextResponse.json({ provider: await getProvider(providerId) });
  } catch (e) {
    return providerFail(e);
  }
}

/** Saves the provider's details, rates and notes, with a change log entry. */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { providerId } = await params;
    const caller = await requireCaller(req);
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({ provider: await updateProvider(caller, providerId, body) });
  } catch (e) {
    return providerFail(e);
  }
}
