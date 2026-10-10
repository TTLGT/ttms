import { NextRequest, NextResponse } from 'next/server';
import { adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { can } from '@/lib/accessControl';
import { requireCaller } from '@/lib/partyAccess';
import { toSaRequest } from '@/lib/saRequestsServer';
import { REQUEST_COLLECTION, type AgreementParty, type SaRequest } from '@/types/saRequest';

/**
 * SA requests for the Approvals screen.
 *
 * For admin and dispatch (`orders.sendAgreement`): every request still to do,
 * and the ones closed in the last fortnight so each can see what the other
 * did. For anybody else: the requests they made themselves.
 *
 * Each query is one field — `status in`, a range on `doneAt`, an equality on
 * `requestedByUid` — so none of them needs a hand-deployed composite index.
 * The collection is one document per load that has ever asked, and sorting is
 * done here.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    const reviewer = can(caller.profile, 'orders.sendAgreement');

    // Both agreements' requests, Shipper and Carrier, each from its own
    // collection with the same single-field queries.
    const since = Timestamp.fromMillis(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const lists = await Promise.all((['client', 'carrier'] as AgreementParty[]).map(async (party) => {
      const col = adminDb.collection(REQUEST_COLLECTION[party]);
      if (reviewer) {
        const [todo, done] = await Promise.all([
          col.where('status', 'in', ['open', 'sent']).get(),
          col.where('doneAt', '>=', since).get(),
        ]);
        const byId = new Map<string, SaRequest>();
        for (const d of [...todo.docs, ...done.docs]) byId.set(d.id, toSaRequest(d.data(), party));
        return [...byId.values()];
      }
      const mine = await col.where('requestedByUid', '==', caller.uid).get();
      return mine.docs.map((d) => toSaRequest(d.data(), party));
    }));
    const rows: SaRequest[] = lists.flat();

    const rank = { open: 0, sent: 1, returned: 2, done: 3 } as const;
    rows.sort((a, b) => rank[a.status] - rank[b.status] || b.requestedAt - a.requestedAt);
    return NextResponse.json({ requests: rows, isReviewer: reviewer });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
