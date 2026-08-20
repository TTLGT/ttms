'use client';

import PartyListPage from '@/components/parties/PartyListPage';

export default function ClientsPage() {
  return (
    <PartyListPage
      role="client"
      title="Clients"
      blurb="the parties that sign the transport contract"
    />
  );
}
