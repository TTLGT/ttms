import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { cleanReason, decideTermsRequest } from '@/lib/termsChangeServer';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * `{ action: 'approve' | 'deny' | 'withdraw', note? }`. Approving and denying
 * need `agreementTerms.approve`; withdrawing is the proposer's alone. Both
 * checks live in decideTermsRequest(), beside the write.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  try {
    const caller = await requireCaller(req);
    const body = await req.json().catch(() => null);
    const action = body?.action;
    if (action !== 'approve' && action !== 'deny' && action !== 'withdraw') {
      return NextResponse.json({ error: 'Approve, deny or withdraw.' }, { status: 400 });
    }
    const request = await decideTermsRequest(caller, id, action, cleanReason(body?.note));
    return NextResponse.json({ request });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
