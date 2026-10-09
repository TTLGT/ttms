import { NextRequest, NextResponse } from 'next/server';
import { adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { can } from '@/lib/accessControl';
import { requireCaller } from '@/lib/partyAccess';
import { toSaRequest } from '@/lib/saRequestsServer';
import { SA_REQUESTS_COLLECTION, type SaRequest } from '@/types/saRequest';

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
    const col = adminDb.collection(SA_REQUESTS_COLLECTION);
    const reviewer = can(caller.profile, 'orders.sendAgreement');

    let rows: SaRequest[];
    if (reviewer) {
      const since = Timestamp.fromMillis(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const [todo, done] = await Promise.all([
        col.where('status', 'in', ['open', 'sent']).get(),
        col.where('doneAt', '>=', since).get(),
      ]);
      const byId = new Map<string, SaRequest>();
      for (const d of [...todo.docs, ...done.docs]) byId.set(d.id, toSaRequest(d.data()));
      rows = [...byId.values()];
    } else {
      const mine = await col.where('requestedByUid', '==', caller.uid).get();
      rows = mine.docs.map((d) => toSaRequest(d.data()));
    }

    const rank = { open: 0, sent: 1, returned: 2, done: 3 } as const;
    rows.sort((a, b) => rank[a.status] - rank[b.status] || b.requestedAt - a.requestedAt);
    return NextResponse.json({ requests: rows, isReviewer: reviewer });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
