import { adminDb } from './firebase-admin';
import { orderTermsOf, readTerms, type TermsParty } from '@/types/agreementTerms';

/** Where the terms live. See src/types/agreementTerms.ts for why it is its own document. */
export function agreementTermsDoc() {
  return adminDb.collection('appSettings').doc('agreementTerms');
}

/**
 * Where each party's "last saved" stamp is kept on that document. The client's
 * is the bare `updatedAt` / `updatedBy` because it was the only one when the
 * document was first written, and live documents carry those names.
 */
export const TERMS_STAMP: Record<TermsParty, { at: string; by: string }> = {
  client:  { at: 'updatedAt',        by: 'updatedBy' },
  carrier: { at: 'carrierUpdatedAt', by: 'carrierUpdatedBy' },
};

/**
 * The terms the next agreement for `party` goes out with — the saved wording,
 * or the default when nothing usable has been saved. Never fails for want of
 * a setting: an agreement that cannot be sent because nobody has visited the
 * Settings panel yet would be a worse failure than sending the old wording.
 */
export async function currentTerms(party: TermsParty): Promise<{ text: string; updatedAt: unknown }> {
  const snap = await agreementTermsDoc().get();
  const stored = snap.exists ? snap.data() : null;
  return { text: readTerms(stored?.[party], party), updatedAt: stored?.[TERMS_STAMP[party].at] ?? null };
}

export function currentClientTerms() {
  return currentTerms('client');
}

export function currentCarrierTerms() {
  return currentTerms('carrier');
}

/**
 * The terms an agreement for this order goes out with: the order's own when
 * it has them (`orderTermsOf()`), the general ones otherwise. What every send
 * and every preview asks — never `currentTerms()` directly for an order.
 * `fromOrder` is stored on the link, so a signed copy can say which it was.
 */
export async function termsForOrder(
  order: Record<string, unknown>,
  party: TermsParty,
): Promise<{ text: string; updatedAt: unknown; fromOrder: boolean }> {
  const own = orderTermsOf(order, party);
  if (own) return { text: own, updatedAt: order[ORDER_TERMS_AT[party]] ?? null, fromOrder: true };
  return { ...(await currentTerms(party)), fromOrder: false };
}

/** When the order's own terms were last set — stamped by /api/orders/{id}/terms. */
export const ORDER_TERMS_AT: Record<TermsParty, string> = {
  client: 'clientTermsUpdatedAt',
  carrier: 'carrierTermsUpdatedAt',
};
