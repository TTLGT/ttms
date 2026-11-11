import { NextRequest, NextResponse } from 'next/server';
import { adminDb, AdminAuthError, FieldValue } from './firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { can } from './accessControl';
import { APP_URL } from './appUrl';
import { postOrderAlert } from './chatAlerts';
import { requireCaller, type Caller } from './partyAccess';
import { getVisibleOrder } from './orderAccess';
import { actorOf, diffFields, writeChange } from './recordHistory';
import { clientContactOf, readinessFactsFor } from './orderReadinessServer';
import { updatePartyAsCaller } from './partyWrites';
import {
  archiveRound, bringIntoOrderRoom, buildSaReview, newRoundId, requestRef, reviewersWhoSeeEverything,
  saGateFactsFor, toSaRequest,
} from './saRequestsServer';
import { orderDisplayNumber, type Order } from '@/types/order';
import { orderReadiness, readinessOf } from '@/types/orderReadiness';
import {
  AGREEMENT_NAME, checkBlockedBy, cleanCcList, isCcEmail, isReviewCheckKey, MAX_SA_CC, outstandingChecks,
  type AgreementParty,
} from '@/types/saRequest';

/**
 * The agreement request on one order — asking for it (the broker) and working
 * it (whoever holds `orders.sendAgreement`) — for either party. The route
 * files are one line each:
 *
 *   /api/orders/{id}/sa-request  — the Shipper Agreement (client)
 *   /api/orders/{id}/ca-request  — the Carrier Agreement (carrier)
 *
 * Sending is still each agreement's own route (send-shipper-agreement,
 * send-agreement), which moves the request to `sent`. See
 * src/types/saRequest.ts for the whole round.
 *
 * Where the two differ, it is said at the spot:
 * - asking for the SA needs everything it prints filled in and moves the
 *   order from Quote to Booked; asking for the carrier's needs a carrier on
 *   the load and moves nothing;
 * - sending the SA back returns the order to Quote; sending the carrier's
 *   back leaves the status alone.
 */

type RouteContext = { params: Promise<{ orderId: string }> };

function fail(e: unknown) {
  if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
}

const isReviewer = (caller: Caller) => can(caller.profile, 'orders.sendAgreement');
const orderLink = (orderId: string) => `${APP_URL}/dashboard/orders/${orderId}`;

/**
 * The request, and everything a reviewer checks it against. Anybody who can
 * see the load may read it — a broker wants to know where their request stands.
 */
export function requestGET(party: AgreementParty) {
  return async function GET(req: NextRequest, { params }: RouteContext) {
    const { orderId } = await params;
    try {
      const caller = await requireCaller(req);
      const order = await getVisibleOrder(caller, orderId);
      const [snap, review] = await Promise.all([
        requestRef(party, orderId).get(),
        buildSaReview(orderId, order, isReviewer(caller), party),
      ]);
      return NextResponse.json({
        request: snap.exists ? toSaRequest(snap.data()!, party) : null,
        isReviewer: isReviewer(caller),
        review,
      });
    } catch (e) {
      return fail(e);
    }
  };
}

/**
 * A broker asks for the agreement. Refused while a request is already open,
 * and while what it needs is missing — the request would only come back.
 * The request, any status move and its change-log entry land in one
 * transaction, so they can never disagree.
 */
export function requestPOST(party: AgreementParty) {
  const name = AGREEMENT_NAME[party];
  return async function POST(req: NextRequest, { params }: RouteContext) {
    const { orderId } = await params;
    try {
      const caller = await requireCaller(req);
      if (!can(caller.profile, 'orders.create')) {
        return NextResponse.json({ error: `You cannot request the ${name}.` }, { status: 403 });
      }
      const order = await getVisibleOrder(caller, orderId);
      const body = (await req.json().catch(() => ({}))) as { note?: unknown };
      const note = (typeof body.note === 'string' ? body.note.trim() : '').slice(0, 1000);

      if (party === 'client') {
        /*
         * Past Booked too, since 2026-11-10: a load that changed after the
         * client signed needs the SA sent again, and the broker has to be able
         * to ask. Two cases had no way to: an update review dispatch sent back
         * ("fix it, then use Request SA again" — with no button and this route
         * refusing), and a load whose signature came from an uploaded copy,
         * where no link exists for a change to hold, so no review opens at all.
         * The status only moves from a quote (below); the send route still
         * refuses to re-send an SA the client has signed unchanged.
         */
        if (order.status === 'cancelled' || order.status === 'completed') {
          return NextResponse.json({ error: `A Shipper Agreement (SA) cannot be requested for a ${order.status} load.` }, { status: 409 });
        }
        const sa = readinessOf(orderReadiness(order as Partial<Order>, await readinessFactsFor(order)), 'sa');
        if (sa.missing.length > 0) {
          return NextResponse.json({
            error: `Fill these in first: ${sa.missing.map((m) => m.label.toLowerCase()).join(', ')}.`,
            missing: sa.missing.map((m) => m.key),
          }, { status: 400 });
        }
      } else {
        // The carrier's agreement is about a carrier: there has to be one.
        if (!order.carrierId) {
          return NextResponse.json({ error: 'Assign a carrier to the load first.' }, { status: 400 });
        }
        if (order.carrierSignedAt) {
          return NextResponse.json({ error: 'The carrier has already signed the agreement.' }, { status: 409 });
        }
        if (['quote', 'cancelled', 'completed'].includes(String(order.status))) {
          return NextResponse.json({ error: 'A Dispatch Sheet is requested for a booked load.' }, { status: 409 });
        }
      }

      const orderRef = adminDb.collection('orders').doc(orderId);
      const reqRef = requestRef(party, orderId);
      const now = Timestamp.now();
      const label = orderDisplayNumber(order as { orderNumber?: string; batsId?: string });

      await adminDb.runTransaction(async (tx) => {
        const [current, orderSnap] = await Promise.all([tx.get(reqRef), tx.get(orderRef)]);
        const status = current.exists ? current.data()!.status : null;
        if (status === 'open' || status === 'sent') {
          throw new AdminAuthError(`Dispatch already has a ${name} request for this load.`, 409);
        }
        // The round being replaced goes into the record first, ticks and all.
        if (current.exists) archiveRound(tx, party, orderId, current.data()!, { supersededAt: now });
        // A fresh round. set() without merge clears the last round's ticks and
        // its "sent back" reason, which belong to the order as it was then.
        // The CC list is kept: who else reads the agreement did not change
        // because the broker fixed a date.
        tx.set(reqRef, {
          party,
          roundId: newRoundId(party, orderId),
          orderId,
          orderNumber: label,
          clientName: String(order.clientName ?? ''),
          ...(party === 'carrier' ? { carrierName: String(order.carrierName ?? '') } : {}),
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
        // Only the SA moves the load: asking for it is what "booked" means.
        if (party === 'client' && orderSnap.data()?.status === 'quote') {
          patch.status = 'booked';
          patch.updatedAt = FieldValue.serverTimestamp();
          tx.update(orderRef, patch);
        }
        writeChange(tx, orderRef, {
          action: 'event',
          summary: note ? `Asked dispatch to send the ${name}: ${note}` : `Asked dispatch to send the ${name}`,
          fields: diffFields(orderSnap.data() ?? {}, patch),
        }, actorOf(caller), now);
      });

      // After the commit. A room or a line that failed must not undo a
      // request that is now on record; the Approvals screen lists it either way.
      const reviewers = await reviewersWhoSeeEverything().catch(() => [] as string[]);
      await bringIntoOrderRoom(orderId, order, [...reviewers, caller.uid], caller.uid).catch(() => {});
      await postOrderAlert(orderId,
        `${caller.displayName} asked dispatch to send the ${name}.${note ? ` Note: ${note}` : ''} `
        + `Review the order and the ${party === 'carrier' ? 'carrier' : 'client'}, then send it: ${orderLink(orderId)}`,
      ).catch(() => {});

      return NextResponse.json({ request: toSaRequest((await reqRef.get()).data()!, party) });
    } catch (e) {
      return fail(e);
    }
  };
}

/**
 * Dispatch working the request:
 *
 * - `{ cc: string[] }` — the addresses the agreement email is copied to, whole list.
 * - `{ check, value }` — tick or untick one review item, as yourself. A tick
 *   the files contradict (see checkBlockedBy) is refused.
 * - `{ sendTo: { email, name } | null, updateClient? }` — SA only: who it is
 *   emailed to on this load, or null for the client's main contact. See
 *   setSaRecipient().
 * - `{ action: 'return', reason }` — send it back to the broker.
 * - `{ action: 'done' }` — close it. Only once the agreement has been sent and
 *   the review list is complete; the person who does it is named to everyone.
 */
export function requestPATCH(party: AgreementParty) {
  const name = AGREEMENT_NAME[party];
  return async function PATCH(req: NextRequest, { params }: RouteContext) {
    const { orderId } = await params;
    try {
      const caller = await requireCaller(req);
      if (!isReviewer(caller)) {
        return NextResponse.json({ error: `Only admin and dispatch work ${name} requests.` }, { status: 403 });
      }
      const order = await getVisibleOrder(caller, orderId);
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const reqRef = requestRef(party, orderId);
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
          return NextResponse.json({ error: `The ${name} can be copied to at most ${MAX_SA_CC} addresses.` }, { status: 400 });
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
      } else if (party === 'client' && 'sendTo' in body) {
        const reply = await setSaRecipient(caller, orderId, order, body.sendTo, body.updateClient === true, reqRef);
        if (reply) return reply;
      } else if (isReviewCheckKey(party, body.check)) {
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
          archiveRound(tx, party, orderId, { ...snap.data()!, ...returned });
          const patch: Record<string, unknown> = {};
          // The SA's request is what booked the load, so sending it back
          // un-books it. The carrier's moved nothing and moves nothing back.
          if (party === 'client' && orderSnap.data()?.status === 'booked') {
            patch.status = 'quote';
            patch.updatedAt = FieldValue.serverTimestamp();
            tx.update(orderRef, patch);
          }
          writeChange(tx, orderRef, {
            action: 'event',
            summary: `Sent the ${name} request back: ${reason}`,
            fields: diffFields(orderSnap.data() ?? {}, patch),
          }, actorOf(caller), now);
        });
        await postOrderAlert(orderId, `${caller.displayName} sent the ${name} request back to the broker: ${reason}`).catch(() => {});
      } else if (body.action === 'done') {
        const gate = await saGateFactsFor(orderId, order);
        await adminDb.runTransaction(async (tx) => {
          const snap = await tx.get(reqRef);
          const data = snap.data();
          if (data?.status !== 'sent') {
            throw new AdminAuthError(data?.status === 'done'
              ? `Already marked done by ${data.doneByName ?? 'somebody'}.`
              : `Send the ${name} before marking the request done.`, 409);
          }
          const left = outstandingChecks(party, data.checks ?? {}, gate);
          if (left.length > 0) {
            throw new AdminAuthError(`Still to check: ${left.map((c) => c.label.toLowerCase()).join(', ')}.`, 409);
          }
          const done = { status: 'done', doneAt: now, doneByUid: caller.uid, doneByName: caller.displayName };
          tx.update(reqRef, done);
          // The record of who approved it, with every tick as it stood at that moment.
          archiveRound(tx, party, orderId, { ...data, ...done });
          writeChange(tx, orderRef, { action: 'event', summary: `Marked the ${name} request done` }, actorOf(caller), now);
        });
        await postOrderAlert(orderId, `${caller.displayName} reviewed this load and marked the ${name} request done.`).catch(() => {});
      } else {
        return NextResponse.json({ error: 'Nothing to do.' }, { status: 400 });
      }

      return NextResponse.json({ request: toSaRequest((await reqRef.get()).data()!, party) });
    } catch (e) {
      return fail(e);
    }
  };
}

/**
 * Who the SA is emailed to on this load (2026-11-06).
 *
 * The person who signs is often not the client's main contact — another
 * buyer, the plant manager for this lane — and sending it to them used to
 * mean leaving the review to edit the client record, changing who every
 * later load went to as well. Now the reviewer types the address here:
 *
 * - by default it is recorded **on the order only** (`saRecipient`), with the
 *   client it was chosen for, and every send of this load's SA goes there;
 * - with `updateClient` the client's main contact itself is changed instead —
 *   the first contact with an email, or the record's own address when it has
 *   none — through updatePartyAsCaller(), so the party's change log and every
 *   check it makes apply, and the order's own choice is cleared because the
 *   main contact now says the same thing;
 * - `null` goes back to the main contact.
 *
 * Reviewers only (checked by the caller), and only while the request is open
 * or sent, like the CC list: whoever is named here receives the client's rate
 * and is the one asked to sign. The signing page accepts the address the link
 * was sent to (src/lib/signAccess.ts), so the chosen person can open it.
 *
 * Returns a response to send instead of the request, or null when done.
 */
async function setSaRecipient(
  caller: Caller,
  orderId: string,
  order: Record<string, unknown>,
  raw: unknown,
  updateClient: boolean,
  reqRef: FirebaseFirestore.DocumentReference,
): Promise<NextResponse | null> {
  const status = (await reqRef.get()).data()?.status;
  if (status !== 'open' && status !== 'sent') {
    return NextResponse.json({ error: 'This request is not open.' }, { status: 409 });
  }
  const clientId = typeof order.clientId === 'string' ? order.clientId : '';
  if (!clientId) return NextResponse.json({ error: 'No client on this order.' }, { status: 400 });

  let next: { email: string; name: string } | null = null;
  if (raw !== null) {
    const r = (raw ?? {}) as { email?: unknown; name?: unknown };
    const email = typeof r.email === 'string' ? r.email.trim() : '';
    if (!isCcEmail(email.toLowerCase())) {
      return NextResponse.json({ error: `Not an email address: ${email || '(blank)'}` }, { status: 400 });
    }
    next = { email, name: (typeof r.name === 'string' ? r.name.trim() : '').slice(0, 120) };
  }

  const orderRef = adminDb.collection('orders').doc(orderId);
  const main = await clientContactOf(clientId);
  const isMain = Boolean(next && main?.email && main.email.toLowerCase() === next.email.toLowerCase());

  if (next && updateClient && !isMain) {
    const snap = await adminDb.collection('parties').doc(clientId).get();
    const party = snap.data();
    if (!party) return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
    const contacts = Array.isArray(party.contacts) ? [...(party.contacts as Record<string, unknown>[])] : [];
    // The same "main contact" the send has always used — clientContactOf().
    const i = contacts.findIndex((c) => typeof c?.email === 'string' && c.email.trim());
    const patch: Record<string, unknown> = {};
    if (i >= 0) {
      contacts[i] = { ...contacts[i], email: next.email, ...(next.name ? { name: next.name } : {}) };
      patch.contacts = contacts;
    } else {
      patch.email = next.email;
      // The record's own name is left alone when it has one: for a person
      // trading under their own name it is the client's name, not a contact's.
      if (next.name && !String(party.contactName ?? '').trim()) patch.contactName = next.name;
    }
    // Throws AdminAuthError, which the route answers, when the caller may not edit it.
    await updatePartyAsCaller(caller, clientId, { patch });
  }

  // A choice that is the main contact, or that has just become it, is no choice:
  // the order goes back to following the client record.
  const store = next && !updateClient && !isMain;
  const before = (order.saRecipient ?? null) as { email?: string } | null;
  const madeMain = Boolean(next && updateClient && !isMain);
  // Nothing on the order to change, and nothing done worth a line on it.
  if (!store && !before && !madeMain) return null;

  const now = Timestamp.now();
  const value = store
    ? { clientId, name: next!.name, email: next!.email, setByName: caller.displayName, setAt: now }
    : null;
  const batch = adminDb.batch();
  if (store || before) batch.update(orderRef, { saRecipient: value, updatedAt: FieldValue.serverTimestamp() });
  writeChange(batch, orderRef, {
    action: 'event',
    summary: store
      ? `The Shipper Agreement (SA) on this load goes to ${next!.name ? `${next!.name} · ` : ''}${next!.email}, `
        + `chosen on the review${main?.email ? ` in place of the client's main contact ${main.email}` : ''}. The client record is unchanged.`
      : madeMain
        ? `Made ${next!.email} the client's main contact from the Shipper Agreement (SA) review; the SA goes there`
        : `The Shipper Agreement (SA) on this load goes to the client's main contact${main?.email ? ` (${main.email})` : ''} again`,
    fields: store || before ? diffFields(order, { saRecipient: value }) : [],
  }, actorOf(caller), now);
  await batch.commit();
  return null;
}
