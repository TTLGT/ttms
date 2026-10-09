'use client';

import Link from 'next/link';

/**
 * A party's name on a record that refers to it, linked to its profile.
 *
 * Falls back to plain text when there is no id. That is not a rare edge: the
 * BATS import carried the three names as free text long before parties had
 * documents, so a load from that era names a shipper it cannot point at.
 * Rendering a dead link there would be worse than rendering the name.
 *
 * Deliberately not gated on canSeeParty(): the profile page answers a denied
 * read by naming the owner and offering to ask them for access, which is a
 * better destination than a name the reader cannot act on. Hiding the link
 * would leave someone looking at a client on their own load with no way to
 * find out whose it is.
 *
 * `fromOrderId` is the load the link sits on, so "Back" on the profile returns
 * to that load rather than to the clients list somebody never came from.
 */
export default function PartyLink({
  id,
  name,
  fromOrderId,
}: {
  id?: string | null;
  name?: string | null;
  fromOrderId?: string | null;
}) {
  const label = (name ?? '').trim();
  if (!label) return <>—</>;
  if (!id) return <>{label}</>;

  const href = fromOrderId
    ? `/dashboard/parties/${id}?fromOrder=${encodeURIComponent(fromOrderId)}`
    : `/dashboard/parties/${id}`;

  return (
    <Link href={href} className="text-brand-600 hover:underline">
      {label}
    </Link>
  );
}
