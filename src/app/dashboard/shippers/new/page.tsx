import { redirect } from 'next/navigation';

/** Superseded by the shared party form; kept so old links still land somewhere useful. */
export default function LegacyNewShipperPage() {
  redirect('/dashboard/parties/new?role=shipper');
}
