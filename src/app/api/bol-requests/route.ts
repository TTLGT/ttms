import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { can } from '@/lib/accessControl';
import { requireCaller } from '@/lib/partyAccess';
import { toBolRequest } from '@/lib/bolRequests';
import { BOL_REQUESTS_COLLECTION } from '@/types/bolRequest';

/**
 * BOLs waiting to be sent, for the Approvals screen — admin and dispatch only
 * (`orders.sendAgreement`). Everybody else gets an empty list rather than a
 * 403, so the screen can ask without knowing who is looking.
 *
 * Still to do, plus those closed in the last fortnight so each sender can see
 * what the others did. One-field queries, no composite index; sorted here.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    if (!can(caller.profile, 'orders.sendAgreement')) return NextResponse.json({ requests: [] });
    const col = adminDb.collection(BOL_REQUESTS_COLLECTION);
    const since = Timestamp.fromMillis(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const [todo, done] = await Promise.all([
      col.where('status', 'in', ['open', 'sent']).get(),
      col.where('doneAt', '>=', since).get(),
    ]);
    const byId = new Map<string, ReturnType<typeof toBolRequest>>();
    for (const d of [...todo.docs, ...done.docs]) byId.set(d.id, toBolRequest(d.data()));
    const rank = { open: 0, sent: 1, done: 2 } as const;
    const requests = [...byId.values()].sort((a, b) => rank[a.status] - rank[b.status] || b.openedAt - a.openedAt);
    return NextResponse.json({ requests });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
