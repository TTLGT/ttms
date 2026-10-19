import { FieldValue, Timestamp, type DocumentSnapshot } from 'firebase-admin/firestore';
import { adminDb, AdminAuthError } from './firebase-admin';
import { can } from './accessControl';
import { actorOf, writeChange, type ChangeActor } from './recordHistory';
import { planAgreementHold } from './clientAgreements';
import { agreementTermsDoc, currentTerms, ORDER_TERMS_AT, TERMS_STAMP } from './agreementTermsServer';
import type { Caller } from './partyAccess';
import { orderDisplayNumber } from '@/types/order';
import {
  MAX_TERMS_REASON, ORDER_TERMS_FIELD, TERMS_DOC_LABEL, orderTermsOf, termsRequestSummary,
  type TermsChangeRequest, type TermsParty, type TermsScope,
} from '@/types/agreementTerms';

/**
 * Changing the terms, and asking an admin to. See `TermsChangeRequest` in
 * src/types/agreementTerms.ts for the arrangement; this is the one place that
 * writes either the general terms or an order's own, so the approval cannot be
 * stepped around by a route that forgot to ask.
 */

export const termsRequests = () => adminDb.collection('termsChangeRequests');

/** May open the terms editors at all — and so propose a change. */
export function canEditTerms(caller: Caller): boolean {
  return can(caller.profile, 'agreementTerms.manage') || can(caller.profile, 'settings.manage');
}

/** May decide a proposal, and change the terms without making one. */
export function canApproveTerms(caller: Caller): boolean {
  return can(caller.profile, 'agreementTerms.approve');
}

export function cleanReason(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, MAX_TERMS_REASON) : '';
}

/** The general terms for `party`, saved. Merged: the other party's are left alone. */
export async function applyGeneralTerms(party: TermsParty, text: string, actor: ChangeActor): Promise<void> {
  const stamp = TERMS_STAMP[party];
  await agreementTermsDoc().set({
    [party]: text,
    [stamp.at]: FieldValue.serverTimestamp(),
    [stamp.by]: actor.email || actor.name,
  }, { merge: true });
}

/**
 * One order's own terms for `party` — `text`, or null to put the load back on
 * the general ones. Written with its change-log entry in one batch, like every
 * other order write.
 *
 * For the client this is a change to what the SA says, so it goes through
 * planAgreementHold() exactly as a changed rate does: a link already sent is
 * held for review and re-sent, and a signed one is signed again. The
 * carrier's are different only because each Dispatch Sheet send is its own
 * link: one already out keeps the terms it was sent with, and the entry says
 * so, because a carrier signing it is agreeing to those.
 */
export async function applyOrderTerms(
  orderId: string,
  party: TermsParty,
  text: string | null,
  actor: ChangeActor,
  approvedBy?: string,
): Promise<void> {
  const ref = adminDb.collection('orders').doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) throw new AdminAuthError('Order not found', 404);
  const before = snap.data()!;
  const field = ORDER_TERMS_FIELD[party];
  const had = orderTermsOf(before, party);
  if ((had ?? null) === (text ?? null)) return;

  const now = Timestamp.now();
  const write: Record<string, unknown> = { [field]: text, [ORDER_TERMS_AT[party]]: now };
  const after = { ...before, ...write };
  const doc = TERMS_DOC_LABEL[party];

  const hold = party === 'client' ? await planAgreementHold(orderId, after, actor, now) : null;
  const liveCarrierLinks = party === 'carrier'
    ? (await adminDb.collection('signing_tokens').where('orderId', '==', orderId).get()).docs.filter((d) => {
      const x = d.data();
      return x.type === 'carrier_agreement' && !x.usedAt && !x.revokedAt && !x.replacedAt;
    }).length
    : 0;

  const summary = [
    text === null
      ? `This load went back to the general terms and conditions on the ${doc}.`
      : had
        ? `This load’s own terms and conditions on the ${doc} were changed.`
        : `This load was given its own terms and conditions on the ${doc}.`,
    approvedBy ? `Approved by ${approvedBy}.` : '',
    liveCarrierLinks ? 'The Dispatch Sheet already sent keeps the terms it went out with; send it again for the carrier to see these.' : '',
  ].filter(Boolean).join(' ');

  const batch = adminDb.batch();
  writeChange(batch, ref, {
    action: 'event',
    summary,
    fields: [{ field, from: had, to: text }],
  }, actor, now);
  hold?.apply(batch, write);
  batch.update(ref, write);
  await batch.commit();
  if (hold) await hold.afterCommit();
}

/** A request document as the screens read it. Timestamps as ISO strings. */
export function serializeRequest(d: DocumentSnapshot): TermsChangeRequest {
  const x = d.data() ?? {};
  const iso = (v: unknown) => (v as { toDate?: () => Date } | null)?.toDate?.()?.toISOString?.() ?? null;
  return {
    id: d.id,
    scope: x.scope === 'order' ? 'order' : 'general',
    party: x.party === 'carrier' ? 'carrier' : 'client',
    orderId: typeof x.orderId === 'string' ? x.orderId : null,
    orderNumber: typeof x.orderNumber === 'string' ? x.orderNumber : null,
    text: typeof x.text === 'string' ? x.text : null,
    baseText: typeof x.baseText === 'string' ? x.baseText : '',
    reason: typeof x.reason === 'string' ? x.reason : '',
    status: x.status ?? 'pending',
    requestedByUid: String(x.requestedByUid ?? ''),
    requestedByName: String(x.requestedByName ?? ''),
    requestedByEmail: String(x.requestedByEmail ?? ''),
    requestedAt: iso(x.requestedAt),
    decidedByUid: typeof x.decidedByUid === 'string' ? x.decidedByUid : null,
    decidedByName: typeof x.decidedByName === 'string' ? x.decidedByName : null,
    decidedAt: iso(x.decidedAt),
    decisionNote: typeof x.decisionNote === 'string' ? x.decisionNote : '',
  };
}

/** The terms a request would replace, as they stand now. */
export async function currentTextFor(r: Pick<TermsChangeRequest, 'scope' | 'party' | 'orderId'>): Promise<string> {
  const general = (await currentTerms(r.party)).text;
  if (r.scope === 'general' || !r.orderId) return general;
  const order = await adminDb.collection('orders').doc(r.orderId).get();
  return orderTermsOf(order.data(), r.party) ?? general;
}

/**
 * Files a proposal. The proposer's own earlier pending request for the same
 * thing is withdrawn in the same batch: the newer wording is what they mean,
 * and an admin approving the older one afterwards would undo it.
 */
export async function fileTermsRequest(caller: Caller, input: {
  scope: TermsScope;
  party: TermsParty;
  orderId: string | null;
  order?: Record<string, unknown>;
  text: string | null;
  baseText: string;
  reason: string;
}): Promise<TermsChangeRequest> {
  const now = Timestamp.now();
  const mine = await termsRequests().where('requestedByUid', '==', caller.uid).get();
  const batch = adminDb.batch();
  for (const d of mine.docs) {
    const x = d.data();
    if (x.status === 'pending' && x.scope === input.scope && x.party === input.party && (x.orderId ?? null) === input.orderId) {
      batch.update(d.ref, { status: 'withdrawn', decidedAt: now, decisionNote: 'Replaced by a newer request.' });
    }
  }
  const ref = termsRequests().doc();
  batch.set(ref, {
    scope: input.scope,
    party: input.party,
    orderId: input.orderId,
    orderNumber: input.order ? orderDisplayNumber(input.order as { orderNumber?: string; batsId?: string }) : null,
    text: input.text,
    baseText: input.baseText,
    reason: input.reason,
    status: 'pending',
    requestedByUid: caller.uid,
    requestedByName: caller.displayName,
    requestedByEmail: caller.email ?? '',
    requestedAt: now,
    decidedByUid: null,
    decidedByName: null,
    decidedAt: null,
    decisionNote: '',
  });
  if (input.orderId) {
    const r = { scope: input.scope, party: input.party, orderNumber: null, text: input.text };
    writeChange(batch, adminDb.collection('orders').doc(input.orderId), {
      action: 'event',
      summary: `${caller.displayName} asked an admin to approve a change: ${termsRequestSummary(r).replace(/^Give one load/, 'give this load').replace(/^Put one load/, 'put this load')}. Nothing changes until it is approved.`,
    }, actorOf(caller), now);
  }
  await batch.commit();
  return serializeRequest(await ref.get());
}

/**
 * Approve, deny or withdraw. The status moves in a transaction first, so two
 * admins pressing Approve at once apply it once; if applying then fails, the
 * request goes back to pending rather than reading as approved.
 */
export async function decideTermsRequest(
  caller: Caller,
  id: string,
  action: 'approve' | 'deny' | 'withdraw',
  note: string,
): Promise<TermsChangeRequest> {
  const ref = termsRequests().doc(id);
  const now = Timestamp.now();

  const req = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new AdminAuthError('That request no longer exists.', 404);
    const r = serializeRequest(snap);
    if (r.status !== 'pending') throw new AdminAuthError('That request has already been decided.', 409);
    if (action === 'withdraw') {
      if (r.requestedByUid !== caller.uid) throw new AdminAuthError('Only the person who asked can withdraw it.', 403);
    } else if (!canApproveTerms(caller)) {
      throw new AdminAuthError('Only an admin can decide changes to the terms.', 403);
    }
    tx.update(ref, {
      status: action === 'approve' ? 'approved' : action === 'deny' ? 'denied' : 'withdrawn',
      decidedByUid: caller.uid,
      decidedByName: caller.displayName,
      decidedAt: now,
      decisionNote: note,
    });
    return r;
  });

  if (action === 'approve') {
    try {
      if (req.scope === 'general') {
        if (req.text === null) throw new Error('A request for the general terms must carry the wording.');
        await applyGeneralTerms(req.party, req.text, { ...actorOf(caller) });
      } else {
        await applyOrderTerms(req.orderId!, req.party, req.text, actorOf(caller), caller.displayName);
      }
    } catch (e) {
      await ref.update({ status: 'pending', decidedByUid: null, decidedByName: null, decidedAt: null, decisionNote: '' });
      throw e;
    }
  } else if (req.orderId) {
    // Turned down or withdrawn: said on the load, so the history shows the
    // request did not just vanish.
    const batch = adminDb.batch();
    writeChange(batch, adminDb.collection('orders').doc(req.orderId), {
      action: 'event',
      summary: action === 'deny'
        ? `${caller.displayName} turned down the request to change this load’s ${TERMS_DOC_LABEL[req.party]} terms${note ? `: ${note}` : '.'}`
        : `${caller.displayName} withdrew the request to change this load’s ${TERMS_DOC_LABEL[req.party]} terms.`,
    }, actorOf(caller), now);
    await batch.commit();
  }

  return serializeRequest(await ref.get());
}
