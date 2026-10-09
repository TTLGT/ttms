import { adminDb } from './firebase-admin';
import type { ReadinessFacts } from '@/types/orderReadiness';

/**
 * The facts `orderReadiness()` needs from other records, read with the Admin
 * SDK. Callers have already decided the caller may see the order.
 *
 * The client's email is found the way send-shipper-agreement finds it — a
 * named contact first, then the party's own address — so "ready" here means
 * the send will find somebody to send to.
 */
export async function clientContactOf(clientId: unknown): Promise<{ name: string; email: string; companyName: string } | null> {
  if (typeof clientId !== 'string' || !clientId) return null;
  const snap = await adminDb.collection('parties').doc(clientId).get();
  if (!snap.exists) return null;
  const client = snap.data()!;
  const contacts: { name?: string; email?: string }[] = Array.isArray(client.contacts) ? client.contacts : [];
  const named = contacts.find((c) => c.email?.trim());
  const companyName = String(client.companyName || client.contactName || '');
  if (named) return { name: named.name ?? '', email: named.email!.trim(), companyName };
  if (typeof client.email === 'string' && client.email.trim()) {
    return { name: String(client.contactName || ''), email: client.email.trim(), companyName };
  }
  return { name: String(client.contactName || ''), email: '', companyName };
}

export async function readinessFactsFor(order: Record<string, unknown>): Promise<ReadinessFacts> {
  const [contact, carrier] = await Promise.all([
    clientContactOf(order.clientId),
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
