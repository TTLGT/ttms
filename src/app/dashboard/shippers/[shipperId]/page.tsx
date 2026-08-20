import { redirect } from 'next/navigation';

/**
 * The `shippers` collection was never populated — it is the empty list that
 * started this migration — so there is no id to map onto a party. Old links go
 * to the list rather than a dead record.
 */
export default function LegacyShipperPage() {
  redirect('/dashboard/shippers');
}
