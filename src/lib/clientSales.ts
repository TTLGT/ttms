'use client';

import { authedFetch } from './personalTasks';
import { loadMySalesDay } from './salesDay';
import type { ClientSalesView, LeadCard, LeadStage } from '@/types/clientSales';
import { SALES_DAY_CHANGED_EVENT } from '@/types/salesDay';

/*
 * The browser's half of leads and sales activity — see src/types/clientSales.ts.
 * Everything goes through /api/parties/{id}/sales and /api/sales/leads; the
 * collection is closed to the client SDK.
 */

export function fetchClientSales(partyId: string): Promise<ClientSalesView> {
  return authedFetch<ClientSalesView>(`/api/parties/${encodeURIComponent(partyId)}/sales`);
}

export type ClientSalesAction =
  | { action: 'log'; kind: 'call' | 'email' | 'note'; text?: string }
  | { action: 'lead' }
  | { action: 'stage'; stage: LeadStage }
  | { action: 'next'; nextStep: string; nextDue: string | null }
  | { action: 'lost'; reason: string }
  | { action: 'reopen' };

export async function actOnClient(partyId: string, act: ClientSalesAction): Promise<ClientSalesView> {
  const view = await authedFetch<ClientSalesView>(`/api/parties/${encodeURIComponent(partyId)}/sales`, {
    method: 'POST', body: JSON.stringify(act),
  });
  // A logged call or email is also a +1 on today's targets, counted by the
  // server; ask once more so the Today card and the counter at the foot of
  // the page show it.
  if (act.action === 'log' && act.kind !== 'note') void loadMySalesDay(true).then((day) => {
    window.dispatchEvent(new CustomEvent(SALES_DAY_CHANGED_EVENT, { detail: day }));
  });
  return view;
}

export interface LeadsBoardView {
  uid: string;
  leads: LeadCard[];
  people?: { uid: string; name: string }[];
}

export function fetchLeads(uid?: string, withPeople = false): Promise<LeadsBoardView> {
  const q = new URLSearchParams();
  if (uid) q.set('uid', uid);
  if (withPeople) q.set('people', '1');
  const s = q.toString();
  return authedFetch<LeadsBoardView>(`/api/sales/leads${s ? `?${s}` : ''}`);
}
