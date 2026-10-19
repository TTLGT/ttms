import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { canApproveTerms, currentTextFor, serializeRequest, termsRequests } from '@/lib/termsChangeServer';

/**
 * Proposed changes to the agreement terms, for the Approvals screen and its
 * badge. `?box=incoming` is everything for an approver and an empty list for
 * anybody else — the answer the profile queue gives too, so the badge costs a
 * broker nothing and the browser needs no permission test.
 * `?box=outgoing` is the caller's own, by the uid off their token.
 */
export async function GET(req: NextRequest) {
  let caller;
  try {
    caller = await requireCaller(req);
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const box = req.nextUrl.searchParams.get('box') === 'outgoing' ? 'outgoing' : 'incoming';
  if (box === 'incoming' && !canApproveTerms(caller)) return NextResponse.json({ requests: [] });

  // Single-field queries only (indexed automatically). Incoming is capped: an
  // approver needs what is waiting and the recent decisions, not every one.
  const snap = box === 'incoming'
    ? await termsRequests().orderBy('requestedAt', 'desc').limit(100).get()
    : await termsRequests().where('requestedByUid', '==', caller.uid).get();
  const requests = snap.docs.map(serializeRequest)
    .sort((a, b) => (b.requestedAt ?? '').localeCompare(a.requestedAt ?? ''));

  // What a pending one would replace, as it stands today — the approver
  // compares against that, not against what the proposer was looking at.
  // Only when asked (`detail=1`): the nav badge counts this list on every
  // page load and needs none of it.
  if (req.nextUrl.searchParams.get('detail') === '1') await Promise.all(requests.filter((r) => r.status === 'pending').map(async (r) => {
    r.currentText = await currentTextFor(r);
  }));

  return NextResponse.json({ requests }, { headers: { 'Cache-Control': 'private, no-store' } });
}
