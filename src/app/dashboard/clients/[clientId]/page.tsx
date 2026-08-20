import { redirect } from 'next/navigation';
import { createHash } from 'crypto';
import { adminDb } from '@/lib/firebase-admin';
import { toNameKey } from '@/types/party';

/**
 * Legacy route: clients used to be `customers/{bats-id}` documents.
 *
 * The migration keyed parties on a hash of the normalized name, so the old id
 * maps onto the new one deterministically — look up the customer, recompute the
 * key, and send the user to the party. Bookmarks and links in old emails keep
 * working instead of dead-ending.
 */
export default async function LegacyClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  const snap = await adminDb.collection('customers').doc(clientId).get();
  if (!snap.exists) redirect('/dashboard/clients');

  const c    = snap.data()!;
  const name = (c.company || '').trim() || (c.name || '').trim();
  const key  = toNameKey(name);
  if (!key) redirect('/dashboard/clients');

  const partyId = `p-${createHash('sha1').update(key).digest('hex').slice(0, 16)}`;
  redirect(`/dashboard/parties/${partyId}`);
}
