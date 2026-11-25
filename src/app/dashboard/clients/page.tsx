'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import PartyListPage from '@/components/parties/PartyListPage';
import LeadsBoard from '@/components/parties/LeadsBoard';
import { useAuth } from '@/context/AuthContext';
import { Bi } from '@/components/spanish/Es';
import { sellsLoads } from '@/types/salesDay';

/**
 * Clients, with My leads beside the list (2026-11-25) for the people who
 * have leads or look after somebody's: brokers and Sales Managers, and
 * `sales.viewAll`. The tab is only what is drawn — /api/sales/leads decides
 * whose board anybody may open.
 */
function Tabs({ active }: { active: 'all' | 'leads' }) {
  const tab = (id: 'all' | 'leads', label: string, href: string) => (
    <Link href={href} data-es={label} aria-current={active === id ? 'page' : undefined}
      className={`px-3 py-1.5 text-sm font-semibold rounded-md ${active === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
      {label}
    </Link>
  );
  return (
    <div className="mb-5 inline-flex gap-1 rounded-lg bg-gray-100 p-1">
      {tab('all', 'All clients', '/dashboard/clients')}
      {tab('leads', 'My leads', '/dashboard/clients?tab=leads')}
    </div>
  );
}

function Clients() {
  const { profile, can } = useAuth();
  const params = useSearchParams();
  const hasLeads = sellsLoads(profile) || (profile?.managedUids?.length ?? 0) > 0 || can('sales.viewAll');
  const onLeads = hasLeads && params.get('tab') === 'leads';

  if (onLeads) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900"><Bi>Clients</Bi></h1>
        <p className="text-sm text-gray-500 mt-0.5 mb-6"><Bi>Every lead from the day it is found to its first load.</Bi></p>
        <Tabs active="leads" />
        <LeadsBoard />
      </div>
    );
  }
  return (
    <PartyListPage
      role="client"
      title="Clients"
      blurb="the parties that sign the transport contract"
      tabs={hasLeads ? <Tabs active="all" /> : undefined}
    />
  );
}

export default function ClientsPage() {
  return (
    <Suspense fallback={null}>
      <Clients />
    </Suspense>
  );
}
