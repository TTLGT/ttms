'use client';

import PartyListPage from '@/components/parties/PartyListPage';

export default function ConsigneesPage() {
  return (
    <PartyListPage
      role="consignee"
      title="Consignees"
      blurb="delivery locations that receive the load"
    />
  );
}
