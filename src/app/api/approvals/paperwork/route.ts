import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { can } from '@/lib/accessControl';
import { requireCaller } from '@/lib/partyAccess';
import { toSaRequest } from '@/lib/saRequestsServer';
import { toBolRequest } from '@/lib/bolRequests';
import { REQUEST_COLLECTION, type AgreementParty, type SaRequest } from '@/types/saRequest';
import { BOL_REQUESTS_COLLECTION, type BolRequest } from '@/types/bolRequest';
import type { PaperworkResponse } from '@/types/paperwork';

/**
 * The Agreements and BOLs card on the Approvals screen (2026-11-13), which
 * replaced the separate "Agreements to send" and "BOLs to send" cards.
 *
 * Why it was rebuilt: those cards asked only for requests still open or sent,
 * plus those done in the last fortnight. A Shipper Agreement sent back to the
 * broker was in neither, so it vanished from the screen the moment it was
 * returned; anything older than two weeks could not be found at all; and a
 * request on a load that had since been cancelled sat in the queue for good.
 *
 * What this answers, in one call:
 *  - everything still in play — open, sent, and sent back — whatever its age;
 *  - everything with any step (asked, sent, sent back, done) between `from`
 *    and `to` (epoch ms; the last 30 days when absent), for the History view;
 *  - the status of each load, so the screen can close the requests on a load
 *    that has ended (see paperworkStatus() in src/types/paperwork.ts).
 *
 * Admin and dispatch (`orders.sendAgreement`) see every load's agreements and
 * the BOLs. Anybody else sees the agreements they asked for and no BOLs, as
 * before.
 *
 * Every query is a range or an equality on one field, so none needs a
 * hand-deployed composite index. The collections are one document per load
 * per agreement — the round in progress; the earlier rounds of a load are
 * read when a row is opened (GET /api/orders/{id}/sa-rounds).
 */
const AGREEMENT_TIMES = ['requestedAt', 'sentAt', 'returnedAt', 'doneAt'] as const;
const BOL_TIMES = ['openedAt', 'doneAt'] as const;
const DAY = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    const reviewer = can(caller.profile, 'orders.sendAgreement');

    const sp = req.nextUrl.searchParams;
    const now = Date.now();
    const toMs = Number(sp.get('to')) || now;
    const fromMs = sp.has('from') ? Math.max(0, Number(sp.get('from')) || 0) : now - 30 * DAY;
    const from = Timestamp.fromMillis(fromMs);
    const to = Timestamp.fromMillis(toMs);

    const agreementLists = await Promise.all((['client', 'carrier'] as AgreementParty[]).map(async (party) => {
      const col = adminDb.collection(REQUEST_COLLECTION[party]);
      const byId = new Map<string, SaRequest>();
      if (reviewer) {
        const snaps = await Promise.all([
          col.where('status', 'in', ['open', 'sent', 'returned']).get(),
          ...AGREEMENT_TIMES.map((f) => col.where(f, '>=', from).where(f, '<=', to).get()),
        ]);
        for (const s of snaps) for (const d of s.docs) byId.set(d.id, toSaRequest(d.data(), party));
      } else {
        // A broker's own requests are few; the date range is applied on the screen.
        const mine = await col.where('requestedByUid', '==', caller.uid).get();
        for (const d of mine.docs) byId.set(d.id, toSaRequest(d.data(), party));
      }
      return [...byId.values()];
    }));
    const agreements = agreementLists.flat();

    let bols: BolRequest[] = [];
    if (reviewer) {
      const col = adminDb.collection(BOL_REQUESTS_COLLECTION);
      const snaps = await Promise.all([
        col.where('status', 'in', ['open', 'sent']).get(),
        ...BOL_TIMES.map((f) => col.where(f, '>=', from).where(f, '<=', to).get()),
      ]);
      const byId = new Map<string, BolRequest>();
      for (const s of snaps) for (const d of s.docs) byId.set(d.id, toBolRequest(d.data()));
      bols = [...byId.values()];
    }

    // The load's own status, read once per load: only the one field.
    const orderIds = [...new Set([...agreements, ...bols].map((r) => r.orderId).filter(Boolean))];
    const orderStatus: Record<string, string> = {};
    for (let i = 0; i < orderIds.length; i += 300) {
      const refs = orderIds.slice(i, i + 300).map((id) => adminDb.collection('orders').doc(id));
      const snaps = await adminDb.getAll(...refs, { fieldMask: ['status'] });
      for (const s of snaps) orderStatus[s.id] = s.exists ? String(s.get('status') ?? '') : 'deleted';
    }

    const body: PaperworkResponse = { isReviewer: reviewer, agreements, bols, orderStatus, from: fromMs, to: toMs };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
