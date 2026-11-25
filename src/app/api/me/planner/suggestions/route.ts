import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { planSuggestionsFor } from '@/lib/plannerSuggestionsServer';

/**
 * What the planning pop-up suggests to the caller — see
 * lib/plannerSuggestionsServer.ts. The caller's own loads and clients only,
 * each re-checked with `canSeeOrder()` / `canSeeParty()`; there is no
 * parameter for whose. Asked for only when the pop-up opens.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    const suggestions = await planSuggestionsFor(caller);
    return NextResponse.json({ suggestions });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
