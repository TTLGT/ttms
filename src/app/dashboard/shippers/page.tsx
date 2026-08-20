'use client';

import PartyListPage from '@/components/parties/PartyListPage';

export default function ShippersPage() {
  return (
    <PartyListPage
      role="shipper"
      title="Shippers"
      blurb="pickup locations that sign the BOL with the driver"
    />
  );
}
