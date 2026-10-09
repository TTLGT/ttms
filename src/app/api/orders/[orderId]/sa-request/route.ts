import { NextRequest, NextResponse } from 'next/server';
import { adminDb, AdminAuthError, FieldValue } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { can } from '@/lib/accessControl';
import { APP_URL } from '@/lib/appUrl';
import { postOrderAlert } from '@/lib/chatAlerts';
import { requireCaller, type Caller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { actorOf, diffFields, writeChange } from '@/lib/recordHistory';
import { readinessFactsFor } from '@/lib/orderReadinessServer';
import {
  archiveRound, bringIntoOrderRoom, buildSaReview, newRoundId, reviewersWhoSeeEverything, saGateFactsFor,
  saRequestRef, toSaRequest,
} from '@/lib/saRequestsServer';
import { orderDisplayNumber, type Order } from '@/types/order';
import { orderReadiness, readinessOf } from '@/types/orderReadiness';
import {
  checkBlockedBy, cleanCcList, isCcEmail, isReviewCheckKey, MAX_SA_CC, outstandingChecks,
} from '@/types/saRequest';

type RouteContext = { params: Promise<{ orderId: string }> };

/**
 * The SA request on one order: asking for it (the broker), and working it
 * (whoever holds `orders.sendAgreement`). Sending the SA itself is still
 * POST /api/orders/{id}/send-shipper-agreement, which moves the request to
 * `sent` — see src/types/saRequest.ts for the whole round.
 */

function fail(e: unknown) {
  if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
}

const isReviewer = (caller: Caller) => can(caller.profile, 'orders.sendAgreement');
const orderLink = (orderId: string) => `${APP_URL}/dashboard/orders/${orderId}`;
const hasCarrier = (order: Record<string, unknown>) => Boolean(order.carrierId || order.carrierName);

/**
 * The request, and everything a reviewer checks it against: the paperwork
 * checklist, who the SA will be emailed to, and the carrier's facts from its
 * own record and its last FMCSA check. Anybody who can see the load may read
 * it — a broker wants to know where their request stands.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    const order = await getVisibleOrder(caller, orderId);

    const [snap, review] = await Promise.all([
      saRequestRef(orderId).get(),
      buildSaReview(orderId, order, isReviewer(caller)),
    ]);
    return NextResponse.json({
      request: snap.exists ? toSaRequest(snap.data()!) : null,
      isReviewer: isReviewer(caller),
      review,
    });
  } catch (e) {
    return fail(e);
  }
}

/**
 * A broker asks for the SA. The quote has been accepted; from here it is
 * dispatch's to check and send.
 *
 * Refused while anything the SA prints is missing — the request would only
 * come back — and while a request is already open. The order moves from
 * `quote` to `booked` in the same transaction as the request, with its
 * change-log entry, so the two can never disagree.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    if (!can(caller.profile, 'orders.create')) {
      return NextResponse.json({ error: 'You cannot request an SA.' }, { status: 403 });
    }
    const order = await getVisibleOrder(caller, orderId);
    const body = (await req.json().catch(() => ({}))) as { note?: unknown };
    const note = (typeof body.note === 'string' ? body.note.trim() : '').slice(0, 1000);

    if (order.status !== 'quote' && order.status !== 'booked') {
      return NextResponse.json({ error: 'An SA can only be requested for a quote.' }, { status: 409 });
    }

    const sa = readinessOf(orderReadiness(order as Partial<Order>, await readinessFactsFor(order)), 'sa');
    if (sa.missing.length > 0) {
      return NextResponse.json({
        error: `Fill these in first: ${sa.missing.map((m) => m.label.toLowerCase()).join(', ')}.`,
        missing: sa.missing.map((m) => m.key),
      }, { status: 400 });
    }

    const orderRef = adminDb.collection('orders').doc(orderId);
    const reqRef = saRequestRef(orderId);
    const now = Timestamp.now();
    const label = orderDisplayNumber(order as { orderNumber?: string; batsId?: string });

    await adminDb.runTransaction(async (tx) => {
      const [current, orderSnap] = await Promise.all([tx.get(reqRef), tx.get(orderRef)]);
      const status = current.exists ? current.data()!.status : null;
      if (status === 'open' || status === 'sent') {
        throw new AdminAuthError('Dispatch already has an SA request for this load.', 409);
      }
      // The round being replaced goes into the record first, ticks and all.
      // It was copied at each step already; this stamps when it ended.
      if (current.exists) archiveRound(tx, orderId, current.data()!, { supersededAt: now });
      // A fresh round. set() without merge clears the last round's ticks and
      // its "sent back" reason, which belong to the order as it was then.
      // The CC list is kept: who else at the client reads the SA did not
      // change because the broker fixed a date.
      tx.set(reqRef, {
        roundId: newRoundId(orderId),
        orderId,
        orderNumber: label,
        clientName: String(order.clientName ?? ''),
        status: 'open',
        note,
        requestedByUid: caller.uid,
        requestedByName: caller.displayName,
        requestedAt: now,
        checks: {},
        sentAt: null, sentByName: null, sentTo: null,
        doneAt: null, doneByName: null,
        returnedAt: null, returnedByName: null, returnReason: null,
        ccEmails: cleanCcList(current.data()?.ccEmails),
        sentCc: [],
        saVersion: null,
        dispatched: null,
        sends: [],
      });
      const patch: Record<string, unknown> = {};
      if (orderSnap.data()?.status === 'quote') {
        patch.status = 'booked';
        patch.updatedAt = FieldValue.serverTimestamp();
        tx.update(orderRef, patch);
      }
      writeChange(tx, orderRef, {
        action: 'event',
        summary: note ? `Asked dispatch to send the Shipper Agreement: ${note}` : 'Asked dispatch to send the Shipper Agreement',
        fields: diffFields(orderSnap.data() ?? {}, patch),
      }, actorOf(caller), now);
    });

    // After the commit. A room or a line that failed must not undo a request
    // that is now on record; the Approvals screen lists it either way.
    const reviewers = await reviewersWhoSeeEverything().catch(() => [] as string[]);
    await bringIntoOrderRoom(orderId, order, [...reviewers, caller.uid], caller.uid).catch(() => {});
    await postOrderAlert(orderId,
      `${caller.displayName} asked dispatch to send the Shipper Agreement.${note ? ` Note: ${note}` : ''} `
      + `Review the order and the carrier, then send it: ${orderLink(orderId)}`,
    ).catch(() => {});

    return NextResponse.json({ request: toSaRequest((await reqRef.get()).data()!) });
  } catch (e) {
    return fail(e);
  }
}

/**
 * Dispatch working the request:
 *
 * - `{ cc: string[] }` — the addresses the SA email is copied to, whole list.
 * - `{ check, value }` — tick or untick one review item, as yourself. A tick
 *   the files contradict (see checkBlockedBy) is refused.
 * - `{ action: 'return', reason }` — send it back to the broker. The order
 *   goes back to `quote`, so the button to ask again comes back with it.
 * - `{ action: 'done' }` — close it. Only once the SA has been sent and the
 *   review list is complete; the person who does it is named to everyone.
 */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    if (!isReviewer(caller)) {
      return NextResponse.json({ error: 'Only admin and dispatch work SA requests.' }, { status: 403 });
    }
    const order = await getVisibleOrder(caller, orderId);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const reqRef = saRequestRef(orderId);
    const orderRef = adminDb.collection('orders').doc(orderId);
    const now = Timestamp.now();

    if (Array.isArray(body.cc)) {
      // Refused rather than quietly cleaned, unlike a read: somebody typed
      // these, and an address dropped without a word is a copy nobody gets.
      const typed = body.cc.map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''));
      const bad = typed.filter((e) => !isCcEmail(e));
      if (bad.length) {
        return NextResponse.json({ error: `Not an email address: ${bad.map((b) => b || '(blank)').join(', ')}` }, { status: 400 });
      }
      if (new Set(typed).size > MAX_SA_CC) {
        return NextResponse.json({ error: `An SA can be copied to at most ${MAX_SA_CC} addresses.` }, { status: 400 });
      }
      const cc = cleanCcList(typed);
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(reqRef);
        const status = snap.data()?.status;
        if (!snap.exists || (status !== 'open' && status !== 'sent')) {
          throw new AdminAuthError('This request is not open.', 409);
        }
        tx.update(reqRef, { ccEmails: cc });
      });
    } else if (isReviewCheckKey(body.check)) {
      const key = body.check;
      // A yes the files contradict is refused here, not only greyed out.
      if (body.value === true) {
        const blocked = checkBlockedBy(key, await saGateFactsFor(orderId, order));
        if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });
      }
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(reqRef);
        const status = snap.data()?.status;
        if (!snap.exists || (status !== 'open' && status !== 'sent')) {
          throw new AdminAuthError('This request is not open.', 409);
        }
        tx.update(reqRef, {
          [`checks.${key}`]: body.value === true
            ? { byUid: caller.uid, byName: caller.displayName, at: now }
            : FieldValue.delete(),
        });
      });
    } else if (body.action === 'return') {
      const reason = (typeof body.reason === 'string' ? body.reason.trim() : '').slice(0, 1000);
      if (!reason) return NextResponse.json({ error: 'Say what the broker needs to fix.' }, { status: 400 });
      await adminDb.runTransaction(async (tx) => {
        const [snap, orderSnap] = await Promise.all([tx.get(reqRef), tx.get(orderRef)]);
        if (snap.data()?.status !== 'open') {
          throw new AdminAuthError('Only a request still waiting for review can be sent back.', 409);
        }
        const returned = { status: 'returned', returnedAt: now, returnedByName: caller.displayName, returnReason: reason };
        tx.update(reqRef, returned);
        archiveRound(tx, orderId, { ...snap.data()!, ...returned });
        const patch: Record<string, unknown> = {};
        if (orderSnap.data()?.status === 'booked') {
          patch.status = 'quote';
          patch.updatedAt = FieldValue.serverTimestamp();
          tx.update(orderRef, patch);
        }
        writeChange(tx, orderRef, {
          action: 'event',
          summary: `Sent the SA request back: ${reason}`,
          fields: diffFields(orderSnap.data() ?? {}, patch),
        }, actorOf(caller), now);
      });
      await postOrderAlert(orderId, `${caller.displayName} sent the SA request back to the broker: ${reason}`).catch(() => {});
    } else if (body.action === 'done') {
      const gate = await saGateFactsFor(orderId, order);
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(reqRef);
        const data = snap.data();
        if (data?.status !== 'sent') {
          throw new AdminAuthError(data?.status === 'done'
            ? `Already marked done by ${data.doneByName ?? 'somebody'}.`
            : 'Send the SA before marking the request done.', 409);
        }
        const left = outstandingChecks(data.checks ?? {}, hasCarrier(order), gate);
        if (left.length > 0) {
          throw new AdminAuthError(`Still to check: ${left.map((c) => c.label.toLowerCase()).join(', ')}.`, 409);
        }
        const done = { status: 'done', doneAt: now, doneByUid: caller.uid, doneByName: caller.displayName };
        tx.update(reqRef, done);
        // The record of who approved it, with every tick as it stood at that moment.
        archiveRound(tx, orderId, { ...data, ...done });
        writeChange(tx, orderRef, { action: 'event', summary: 'Marked the SA request done' }, actorOf(caller), now);
      });
      await postOrderAlert(orderId, `${caller.displayName} reviewed this load and marked the SA request done.`).catch(() => {});
    } else {
      return NextResponse.json({ error: 'Nothing to do.' }, { status: 400 });
    }

    return NextResponse.json({ request: toSaRequest((await reqRef.get()).data()!) });
  } catch (e) {
    return fail(e);
  }
}
