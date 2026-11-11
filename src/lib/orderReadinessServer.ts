import { adminDb } from './firebase-admin';
import type { ReadinessFacts } from '@/types/orderReadiness';
import { saContactIndex } from '@/types/party';

/**
 * The facts `orderReadiness()` needs from other records, read with the Admin
 * SDK. Callers have already decided the caller may see the order.
 *
 * The client's email is found the way send-shipper-agreement finds it — a
 * named contact first, then the party's own address — so "ready" here means
 * the send will find somebody to send to. A recipient chosen on the load
 * itself takes precedence — see clientAgreementContact() below.
 */
export async function clientContactOf(clientId: unknown): Promise<{ name: string; email: string; companyName: string } | null> {
  if (typeof clientId !== 'string' || !clientId) return null;
  const snap = await adminDb.collection('parties').doc(clientId).get();
  if (!snap.exists) return null;
  const client = snap.data()!;
  const contacts: { name?: string; email?: string }[] = Array.isArray(client.contacts) ? client.contacts : [];
  // The contact ticked "Signs the SA", else an imported one — see saContactIndex().
  const named = contacts[saContactIndex(contacts)];
  const companyName = String(client.companyName || client.contactName || '');
  if (named) return { name: named.name ?? '', email: named.email!.trim(), companyName };
  if (typeof client.email === 'string' && client.email.trim()) {
    return { name: String(client.contactName || ''), email: client.email.trim(), companyName };
  }
  return { name: String(client.contactName || ''), email: '', companyName };
}

/**
 * The recipient chosen on this load (`Order.saRecipient`), or null when there
 * is none, it is malformed, or it was chosen for a client the load no longer has.
 */
export function orderSaRecipient(order: Record<string, unknown>): { name: string; email: string } | null {
  const r = order.saRecipient as { clientId?: unknown; name?: unknown; email?: unknown } | null | undefined;
  if (!r || typeof r !== 'object') return null;
  if (typeof order.clientId !== 'string' || r.clientId !== order.clientId) return null;
  const email = typeof r.email === 'string' ? r.email.trim() : '';
  if (!email) return null;
  return { name: typeof r.name === 'string' ? r.name : '', email };
}

/**
 * Who this load's SA goes to: the recipient chosen on the order when there is
 * one, otherwise the client's main contact (clientContactOf()). Every place
 * that emails, names or checks the SA's signer reads this, so the review, the
 * send, the quote's "Attention" line and the readiness item agree.
 * `main` is the client's own main contact either way, so a screen can say
 * whose place the chosen one is taking.
 */
export async function clientAgreementContact(order: Record<string, unknown>): Promise<{
  name: string; email: string; companyName: string;
  chosen: boolean;
  main: { name: string; email: string } | null;
} | null> {
  const contact = await clientContactOf(order.clientId);
  if (!contact) return null;
  const main = contact.email ? { name: contact.name, email: contact.email } : null;
  const chosen = orderSaRecipient(order);
  return chosen
    ? { ...chosen, companyName: contact.companyName, chosen: true, main }
    : { ...contact, chosen: false, main };
}

export async function readinessFactsFor(order: Record<string, unknown>): Promise<ReadinessFacts> {
  const [contact, carrier] = await Promise.all([
    clientAgreementContact(order),
    typeof order.carrierId === 'string' && order.carrierId
      ? adminDb.collection('carriers').doc(order.carrierId).get()
      : Promise.resolve(null),
  ]);
  const c = carrier && carrier.exists ? carrier.data()! : null;
  return {
    clientHasEmail: order.clientId ? Boolean(contact?.email) : false,
    carrierHasDotOrMc: c ? Boolean(String(c.dot ?? '').trim() || String(c.mc ?? '').trim()) : null,
  };
}
