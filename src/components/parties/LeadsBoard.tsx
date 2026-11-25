'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react';
import { Bi } from '@/components/spanish/Es';
import { useAuth } from '@/context/AuthContext';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { actOnClient, fetchLeads } from '@/lib/clientSales';
import { officeToday } from '@/types/celebration';
import {
  BOARD_COLUMNS, BOARD_COLUMN_HINT, BOARD_COLUMN_LABEL, LEAD_STAGES, isLeadStage,
  type BoardColumn, type LeadCard, type LeadStage,
} from '@/types/clientSales';

/**
 * Clients → My leads: a board of somebody's leads, Found → Contacted → Quoted
 * → First load. See src/types/clientSales.ts.
 *
 * A card moves by dragging it to another column, by its arrows, or by itself:
 * logging a call moves a found lead to Contacted, a load created for it moves
 * it to Quoted, and its first booked load to First load. Only the first three
 * columns can be dropped on — First load is TTMS's to decide.
 *
 * A Sales Manager, or anybody with `sales.viewAll`, can switch to somebody
 * else's board; the server decides who appears in that list and refuses any
 * other.
 */
export default function LeadsBoard({ onLoaded }: {
  /** Once the first board has drawn — the tour waits for it, or its board and card steps would find nothing. */
  onLoaded?: () => void;
} = {}) {
  const { user } = useAuth();
  const [uid, setUid] = useState<string>('');
  const [leads, setLeads] = useState<LeadCard[] | null>(null);
  const [people, setPeople] = useState<{ uid: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [moving, setMoving] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<BoardColumn | null>(null);
  const { formatCalendarDate } = useDateFormatters();
  const today = officeToday();

  const load = useCallback(async (who: string, withPeople: boolean) => {
    setError('');
    try {
      const v = await fetchLeads(who || undefined, withPeople);
      setLeads(v.leads);
      if (v.people) setPeople(v.people);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the leads');
      setLeads([]);
    } finally {
      onLoaded?.();
    }
  }, [onLoaded]);

  useEffect(() => { void load('', true); }, [load]);

  async function moveTo(card: LeadCard, stage: LeadStage) {
    if (card.column === 'won' || card.stage === stage) return;
    setMoving(card.partyId); setError('');
    try {
      await actOnClient(card.partyId, { action: 'stage', stage });
      await load(uid, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move it');
    } finally {
      setMoving(null);
    }
  }

  const mine = !uid || uid === user?.uid;
  // The tour lights one card: the first one, in column order.
  const firstCard = leads ? BOARD_COLUMNS.map((c) => leads.find((l) => l.column === c)).find(Boolean)?.partyId : undefined;
  const others = people.filter((p) => p.uid !== user?.uid);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {others.length > 0 && (
          <label className="text-sm text-gray-600" data-tour="leads-whose">
            <span data-es className="mr-2">Whose leads</span>
            <select value={uid} onChange={(e) => { setUid(e.target.value); setLeads(null); void load(e.target.value, false); }}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white">
              <option value="">Mine</option>
              {others.map((p) => <option key={p.uid} value={p.uid}>{p.name}</option>)}
            </select>
          </label>
        )}
        <p className="text-sm text-gray-500" data-tour="leads-privacy"><Bi>Only you, your Sales Manager and admins see this board.</Bi></p>
        {mine && (
          <Link href="/dashboard/parties/new?role=client&lead=1" data-es="Add a lead" data-tour="leads-add"
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            <Plus className="w-4 h-4" aria-hidden />Add a lead
          </Link>
        )}
      </div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {leads === null ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" aria-hidden /></div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" data-tour="leads-board">
          {BOARD_COLUMNS.map((col) => {
            const cards = leads.filter((l) => l.column === col);
            const droppable = isLeadStage(col);
            return (
              <div key={col}
                onDragOver={(e) => { if (droppable) { e.preventDefault(); setDragOver(col); } }}
                onDragLeave={() => setDragOver((c) => (c === col ? null : c))}
                onDrop={(e) => {
                  setDragOver(null);
                  const id = e.dataTransfer.getData('text/plain');
                  const card = leads.find((l) => l.partyId === id);
                  if (card && isLeadStage(col)) void moveTo(card, col);
                }}
                className={`rounded-xl bg-gray-50 p-3 min-h-[10rem] ${dragOver === col ? 'ring-2 ring-brand-400' : ''}`}>
                <p className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-gray-500" title={BOARD_COLUMN_HINT[col]}>
                  <span data-es>{BOARD_COLUMN_LABEL[col]}</span><span className="text-gray-700">{cards.length}</span>
                </p>
                <div className="mt-2 space-y-2">
                  {cards.length === 0 && <p className="text-xs text-gray-400"><Bi>{BOARD_COLUMN_HINT[col]}</Bi></p>}
                  {cards.map((card) => {
                    const due = card.nextDue;
                    const dueTone = !due ? '' : due < today ? 'bg-red-50 text-red-700' : due === today ? 'bg-amber-50 text-amber-800' : 'bg-brand-50 text-brand-700';
                    const at = LEAD_STAGES.indexOf(card.stage);
                    return (
                      <div key={card.partyId} draggable={card.column !== 'won'}
                        data-tour={card.partyId === firstCard ? 'leads-card' : undefined}
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', card.partyId)}
                        className={`rounded-lg border bg-white p-3 text-sm ${card.column === 'won' ? 'border-green-300' : 'border-gray-200'} ${moving === card.partyId ? 'opacity-50' : ''}`}>
                        <Link href={`/dashboard/parties/${card.partyId}?from=client#sales`} className="font-semibold text-gray-900 hover:text-brand-600 hover:underline">
                          {card.partyName || 'Unnamed client'}
                        </Link>
                        {card.sourceLabel && <p className="text-xs text-gray-500">{card.sourceLabel}</p>}
                        {card.column === 'won' ? (
                          <p data-es className="mt-1.5 inline-block rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">Now a client</p>
                        ) : (card.nextStep || due) && (
                          <p className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${dueTone || 'bg-gray-100 text-gray-600'}`}>
                            {card.nextStep || 'Next step'}{due ? ` · ${due === today ? 'today' : formatCalendarDate(due)}` : ''}
                          </p>
                        )}
                        {card.column !== 'won' && (
                          <div className="mt-2 flex justify-end gap-1">
                            <button type="button" aria-label="Move back" disabled={at <= 0 || !!moving}
                              onClick={() => void moveTo(card, LEAD_STAGES[at - 1])}
                              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                            <button type="button" aria-label="Move on" disabled={at >= LEAD_STAGES.length - 1 || !!moving}
                              onClick={() => void moveTo(card, LEAD_STAGES[at + 1])}
                              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {leads !== null && leads.length === 0 && !error && (
        <p className="mt-4 text-sm text-gray-500">
          <Bi>No leads yet. Add one, or open a client with no loads and press Track as a lead.</Bi>
        </p>
      )}
    </div>
  );
}
