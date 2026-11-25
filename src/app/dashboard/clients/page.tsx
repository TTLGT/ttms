'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import PartyListPage from '@/components/parties/PartyListPage';
import LeadsBoard from '@/components/parties/LeadsBoard';
import { useAuth } from '@/context/AuthContext';
import { Bi } from '@/components/spanish/Es';
import { sellsLoads } from '@/types/salesDay';
import PlannerTour, { LEADS_TOUR } from '@/components/planner/PlannerTour';
import { recordTour, tourSeen } from '@/lib/planner';

/**
 * Clients, with My leads beside the list (2026-11-25) for the people who
 * have leads or look after somebody's: brokers and Sales Managers, and
 * `sales.viewAll`. The tab is only what is drawn — /api/sales/leads decides
 * whose board anybody may open.
 */
function Tabs({ active, onHelp }: { active: 'all' | 'leads'; onHelp?: () => void }) {
  const tab = (id: 'all' | 'leads', label: string, href: string) => (
    <Link href={href} data-es={label} aria-current={active === id ? 'page' : undefined}
      className={`px-3 py-1.5 text-sm font-semibold rounded-md ${active === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
      {label}
    </Link>
  );
  return (
    <div className="mb-5 flex items-center gap-2">
      <div className="inline-flex gap-1 rounded-lg bg-gray-100 p-1" data-tour="leads-tabs">
        {tab('all', 'All clients', '/dashboard/clients')}
        {tab('leads', 'My leads', '/dashboard/clients?tab=leads')}
      </div>
      {onHelp && (
        <button type="button" onClick={onHelp} aria-label="Show me around My leads" title="Show me around My leads"
          className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
          <HelpCircle size={16} />
        </button>
      )}
    </div>
  );
}

function Clients() {
  const { profile, can } = useAuth();
  const params = useSearchParams();
  const hasLeads = sellsLoads(profile) || (profile?.managedUids?.length ?? 0) > 0 || can('sales.viewAll');
  const onLeads = hasLeads && params.get('tab') === 'leads';

  // The tour starts by itself on the first visit to My leads, once the
  // account's record of tours is in (so it does not start again on every
  // computer), and once per visit, since the profile refreshes live. The ?
  // beside the tabs plays it again. Same arrangement as the Planner's tabs.
  const [touring, setTouring] = useState(false);
  const [boardReady, setBoardReady] = useState(false);
  const markReady = useCallback(() => setBoardReady(true), []);
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!onLeads || !profile || autoStarted.current) return;
    if (!tourSeen(profile.preferences?.toursSeen, 'leads')) {
      autoStarted.current = true;
      setTouring(true);
    }
  }, [onLeads, profile]);

  if (onLeads) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900"><Bi>Clients</Bi></h1>
        <p className="text-sm text-gray-500 mt-0.5 mb-6"><Bi>Every lead from the day it is found to its first load.</Bi></p>
        <Tabs active="leads" onHelp={() => setTouring(true)} />
        <LeadsBoard onLoaded={markReady} />
        {touring && boardReady && (
          <PlannerTour steps={LEADS_TOUR} label="My leads" onClose={(how) => {
            setTouring(false);
            // A tour nobody saw is not recorded, so it is offered again next visit.
            if (how !== 'nothing') void recordTour('leads', how === 'finished');
          }} />
        )}
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
