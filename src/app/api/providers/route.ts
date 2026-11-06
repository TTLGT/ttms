import { NextRequest, NextResponse } from 'next/server';
import { requireCaller } from '@/lib/partyAccess';
import { createProvider, listProviders } from '@/lib/providersServer';
import { providerFail } from '@/lib/providerRouteErrors';

/**
 * The 3rd-party provider directory — every provider, to anybody signed in.
 * Deliberately not narrowed: nobody owns a lumper crew, and the directory
 * exists so the next person at that dock can find them. Searched in the
 * browser, which has the whole list; see providerMatches().
 */
export async function GET(req: NextRequest) {
  try {
    await requireCaller(req);
    return NextResponse.json({ providers: await listProviders() });
  } catch (e) {
    return providerFail(e);
  }
}

/** Adds a provider. Everybody but interns — see assertMayWork(). */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({ provider: await createProvider(caller, body) });
  } catch (e) {
    return providerFail(e);
  }
}
