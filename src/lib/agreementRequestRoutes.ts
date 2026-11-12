import { NextRequest, NextResponse } from 'next/server';
import { adminDb, AdminAuthError, FieldValue } from './firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { can, WORK_GROUPS_COLLECTION } from './accessControl';
import { APP_URL } from './appUrl';
import { postOrderAlert } from './chatAlerts';
import { requireCaller, type Caller } from './partyAccess';
import { getVisibleOrder } from './orderAccess';
import { actorOf, diffFields, writeChange } from './recordHistory';
import { clientContactOf, readinessFactsFor } from './orderReadinessServer';
import { updatePartyAsCaller } from './partyWrites';
import { saContactIndex } from '@/types/party';
import {
  archiveRound, bringIntoOrderRoom, buildSaReview, newRoundId, requestRef, reviewersWhoSeeEverything,
  saGateFactsFor, toSaRequest,
} from './saRequestsServer';
import { orderDisplayNumber, type Order } from '@/types/order';
import { orderReadiness, readinessOf } from '@/types/orderReadiness';
import {
  AGREEMENT_BUTTON, AGREEMENT_NAME, checkBlockedBy, cleanCcList, isCcEmail, isReviewCheckKey, MAX_SA_CC,
  outstandingChecks, saFixList, type AgreementParty,
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
/** The order page with this party's review panel open (see the order page's hash effect). */
const reviewLink = (orderId: string, party: AgreementParty) =>
  `${orderLink(orderId)}#${party === 'carrier' ? 'ca' : 'sa'}-review`;

/**
 * Everybody a review is about: whoever asked for it, and every owner of the
 * load — the people on `assignedToUids` and the members of each work group
 * on `assignedToGroupIds` (2026-11-12: "all owners of the load", rather than
 * only the broker the paperwork names). Owners can see the load, so they
 * belong in its room.
 *
 * Put into the load's room before the line meant for them is posted, so it
 * reaches their chat inbox unread with the desktop notification a new line
 * brings — the same way a request reaches dispatch. Chat only, no email, by
 * choice. Best-effort, like every room line: what it announces is already on
 * record. The person acting is left out of the names, and suspended
 * accounts are neither added nor named.
 */
async function tellOwners(
  orderId: string,
  order: Record<string, unknown>,
  requestedByUid: string | null,
  callerUid: string,
  text: (names: string) => string,
): Promise<void> {
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : []);
  const groupIds = list(order.assignedToGroupIds);
  const groups = groupIds.length
    ? await adminDb.getAll(...groupIds.map((g) => adminDb.collection(WORK_GROUPS_COLLECTION).doc(g)))
    : [];
  const uids = [...new Set([
    ...(requestedByUid ? [requestedByUid] : []),
    ...list(order.assignedToUids),
    ...groups.flatMap((g) => list(g.data()?.memberUids)),
  ])].filter((u) => u !== callerUid);
  const snaps = uids.length ? await adminDb.getAll(...uids.map((u) => adminDb.collection('users').doc(u))) : [];
  const live = snaps.filter((x) => x.exists && x.data()?.suspended !== true);
  const names = live
    .map((x) => String(x.data()?.displayName ?? x.data()?.name ?? '').trim())
    .filter(Boolean);
  await bringIntoOrderRoom(orderId, order, [...live.map((x) => x.id), callerUid], callerUid).catch(() => {});
  const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? 'the broker';
  await postOrderAlert(orderId, text(who)).catch(() => {});
}

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
      const body = (await req.json().catch(() => ({}))) as { note?: unknown; start?: unknown };
      /*
       * `start` is admin or dispatch opening the review themselves — "Send
       * for Client Signature" on Client Confirmation (2026-11-12). That button
       * used to email the client straight away, with nothing checked; now it
       * opens the same review a broker's request does, and the SA goes out
       * from there. Nothing has to be filled in first: the review is where
       * the reviewer sees what is missing, and the send route refuses while
       * anything is.
       */
      const start = body.start === true && party === 'client';
      if (start ? !isReviewer(caller) : !can(caller.profile, 'orders.create')) {
        return NextResponse.json({ error: `You cannot ${start ? 'start' : 'request'} the ${name}.` }, { status: 403 });
      }
      const order = await getVisibleOrder(caller, orderId);
      const note = (typeof body.note === 'string' ? body.note.trim() : '').slice(0, 1000);

      if (start) {
        if (order.status === 'cancelled' || order.status === 'completed') {
          return NextResponse.json({ error: `A Shipper Agreement (SA) cannot be sent for a ${order.status} load.` }, { status: 409 });
        }
        // Already being worked: open that one rather than refusing.
        const current = await requestRef(party, orderId).get();
        const status = current.exists ? current.data()!.status : null;
        if (status === 'open' || status === 'sent') {
          return NextResponse.json({ request: toSaRequest(current.data()!, party) });
        }
      } else if (party === 'client') {
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
          throw new AdminAuthError(`Dispatch already has a ${name} ${start ? 'review' : 'request'} for this load.`, 409);
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
          byReviewer: start,
          status: 'open',
          note,
          requestedByUid: caller.uid,
          requestedByName: caller.displayName,
          requestedAt: now,
          checks: {},
          sentAt: null, sentByName: null, sentTo: null,
          doneAt: null, doneByName: null,
          returnedAt: null, returnedByName: null, returnReason: null, returnedChecks: [],
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
          summary: start
            ? `Started the ${name} review before sending it to the client`
            : note ? `Asked dispatch to send the ${name}: ${note}` : `Asked dispatch to send the ${name}`,
          fields: diffFields(orderSnap.data() ?? {}, patch),
        }, actorOf(caller), now);
      });

      if (start) {
        // The broker hears that their load's SA is under way, so nobody asks
        // for it a second time or tells the client it is coming before it is.
        // One fact per line, which the chat card (src/lib/chatAlertCards.ts)
        // reads back into a headline and a sentence. Reword it there too.
        await tellOwners(orderId, order, null, caller.uid, (names) =>
          `${caller.displayName} started the ${name} review for ${names}.\n`
          + 'Admin or dispatch will email it to the client once the load is checked. '
          + `If anything needs fixing, it comes back to you with a list: ${reviewLink(orderId, party)}`,
        );
        return NextResponse.json({ request: toSaRequest((await reqRef.get()).data()!, party) });
      }

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
        // The double-check items the reviewer says are wrong; unknown keys dropped.
        const flagged = Array.isArray(body.checks)
          ? [...new Set(body.checks.filter((k): k is string => isReviewCheckKey(party, k)))]
          : [];
        let requestedByUid: string | null = null;
        let unbooked = false;
        await adminDb.runTransaction(async (tx) => {
          const [snap, orderSnap] = await Promise.all([tx.get(reqRef), tx.get(orderRef)]);
          const data = snap.data();
          if (!data || data.status !== 'open') {
            throw new AdminAuthError('Only a request still waiting for review can be sent back.', 409);
          }
          // Not the reviewer who opened it themselves: the broker is who it goes back to.
          requestedByUid = data.byReviewer !== true && typeof data.requestedByUid === 'string' ? data.requestedByUid : null;
          const returned = {
            status: 'returned', returnedAt: now, returnedByName: caller.displayName, returnReason: reason,
            returnedChecks: flagged,
          };
          tx.update(reqRef, returned);
          archiveRound(tx, party, orderId, { ...data, ...returned });
          const patch: Record<string, unknown> = {};
          /*
           * The SA's first request is what booked the load, so sending it
           * back un-books it. Not an update review (`changed`): that load was
           * booked, and its SA sent, long before this round, and sending the
           * update back means "fix the change", not "this was never booked".
           * The carrier's moved nothing and moves nothing back.
           */
          if (party === 'client' && data.reason !== 'changed' && orderSnap.data()?.status === 'booked') {
            patch.status = 'quote';
            patch.updatedAt = FieldValue.serverTimestamp();
            tx.update(orderRef, patch);
            unbooked = true;
          }
          writeChange(tx, orderRef, {
            action: 'event',
            summary: `Sent the ${name} request back: ${reason}`,
            fields: diffFields(orderSnap.data() ?? {}, patch),
          }, actorOf(caller), now);
        });
        /*
         * The broker is told in the load's room, with the same list the
         * review panel shows them, so the line alone says what to do. When
         * TTMS finds nothing and nothing was marked, the reviewer's note is
         * the whole message.
         */
        const review = await buildSaReview(orderId, order, false, party).catch(() => null);
        const fixes = review ? saFixList(party, review, flagged) : [];
        /*
         * Laid out in lines — the reason, then one line per thing to fix —
         * because a sentence with seven fixes run together was unreadable
         * (2026-11-12). The chat card (src/lib/chatAlertCards.ts) draws the
         * lines as a list; the room preview and search still get plain text.
         * Reword this and reword the pattern there.
         */
        const list = fixes.length ? `\nTo fix:\n${fixes.map((f) => `- ${f.text}`).join('\n')}` : '';
        await tellOwners(orderId, order, requestedByUid, caller.uid, (names) =>
          `${caller.displayName} sent the ${name} back to ${names}.\n`
          + `Reason: ${reason}${list}\n`
          + `${fixes.length ? 'Each one has a Fix link in the review. ' : ''}`
          + `Then use Request ${AGREEMENT_BUTTON[party]} again: ${reviewLink(orderId, party)}`,
        );
        return NextResponse.json({
          request: toSaRequest((await reqRef.get()).data()!, party),
          orderStatus: unbooked ? 'quote' : null,
        });
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
    const i = saContactIndex(contacts);
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
