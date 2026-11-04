'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Inbox, LifeBuoy, Loader2, Paperclip, Plus, Search } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { listItTickets } from '@/lib/itTickets';
import NewTicketForm from '@/components/itSupport/NewTicketForm';
import TicketThread from '@/components/itSupport/TicketThread';
import { PriorityChip, StatusChip } from '@/components/itSupport/TicketChips';
import {
  CATEGORY_SHORT,
  IT_TICKET_PRIORITIES,
  PRIORITY_LABEL,
  PRIORITY_RANK,
  isItDesk,
  isOpenStatus,
  ticketNumberLabel,
  type ItTicket,
  type ItTicketPriority,
} from '@/types/itTicket';

/**
 * IT support. One address, two pages:
 *
 *  - Everybody: report an issue, and follow the ones they reported.
 *  - The IT account: the desk — every ticket, filtered, sorted by how urgent
 *    and how long it has waited, worked from the same conversation view.
 *
 * Which one is decided by the address here only to draw the right screen;
 * the API decides what is actually sent. See src/types/itTicket.ts.
 *
 * `?ticket=<id>` opens one (the link in IT's email), `?new=1` opens the form.
 */
export default function ItSupportPage() {
  return (
    <Suspense fallback={null}>
      <ItSupport />
    </Suspense>
  );
}

type DeskFilter = 'needs' | 'open' | 'waiting' | 'resolved' | 'closed' | 'all';
type DeskSort = 'urgent' | 'newest' | 'oldest';

const FILTERS: { id: DeskFilter; label: string }[] = [
  { id: 'needs',    label: 'Needs a reply' },
  { id: 'open',     label: 'All open' },
  { id: 'waiting',  label: 'Waiting on reporter' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed',   label: 'Closed' },
  { id: 'all',      label: 'Everything' },
];

function matchesFilter(t: ItTicket, f: DeskFilter): boolean {
  switch (f) {
    case 'needs':    return t.needsIt && isOpenStatus(t.status);
    case 'open':     return isOpenStatus(t.status);
    case 'waiting':  return t.status === 'waiting';
    case 'resolved': return t.status === 'resolved';
    case 'closed':   return t.status === 'closed';
    default:         return true;
  }
}

function ItSupport() {
  const { user } = useAuth();
  const desk = isItDesk(user?.email);
  const { formatDateTime } = useDateFormatters();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = params.get('ticket');
  const composing = params.get('new') === '1';

  const [tickets, setTickets] = useState<ItTicket[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<DeskFilter>('needs');
  const [sort, setSort] = useState<DeskSort>('urgent');
  const [priority, setPriority] = useState<ItTicketPriority | ''>('');
  const [query, setQuery] = useState('');

  const go = useCallback((next: { ticket?: string | null; new?: boolean }) => {
    const q = new URLSearchParams();
    if (next.ticket) q.set('ticket', next.ticket);
    if (next.new) q.set('new', '1');
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }, [router, pathname]);

  const load = useCallback(async () => {
    try {
      setTickets(await listItTickets());
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Somebody with no tickets yet came here to report one.
  useEffect(() => {
    if (!desk && tickets && tickets.length === 0 && !selected && !composing) go({ new: true });
  }, [desk, tickets, selected, composing, go]);

  /** The open ticket changed — keep its row in the list in step. */
  const onChanged = useCallback((t: ItTicket) => {
    setTickets((prev) => {
      if (!prev) return prev;
      const i = prev.findIndex((x) => x.id === t.id);
      if (i < 0) return [t, ...prev];
      const next = prev.slice();
      next[i] = t;
      return next;
    });
  }, []);

  const counts = useMemo(() => {
    const list = tickets ?? [];
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return {
      needs:    list.filter((t) => matchesFilter(t, 'needs')).length,
      open:     list.filter((t) => isOpenStatus(t.status)).length,
      urgent:   list.filter((t) => isOpenStatus(t.status) && (t.priority === 'urgent' || t.priority === 'high')).length,
      resolved: list.filter((t) => !isOpenStatus(t.status) && t.resolvedAt >= weekAgo).length,
      byFilter: Object.fromEntries(FILTERS.map((f) => [f.id, list.filter((t) => matchesFilter(t, f.id)).length])) as Record<DeskFilter, number>,
    };
  }, [tickets]);

  const shown = useMemo(() => {
    let list = tickets ?? [];
    if (desk) {
      list = list.filter((t) => matchesFilter(t, filter));
      if (priority) list = list.filter((t) => t.priority === priority);
    }
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length) {
      list = list.filter((t) => {
        const hay = `${ticketNumberLabel(t.number)} ${t.title} ${t.reporterName} ${t.reporterEmail} ${t.lastMessageText} ${CATEGORY_SHORT[t.category]}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      });
    }
    const sorted = list.slice();
    if (!desk) {
      // A reporter's own: anything with a new answer first, then newest.
      sorted.sort((a, b) => Number(b.reporterUnread) - Number(a.reporterUnread) || b.updatedAt - a.updatedAt);
    } else if (sort === 'urgent') {
      // Most urgent first; within the same priority, whoever has waited longest.
      sorted.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.updatedAt - b.updatedAt);
    } else if (sort === 'oldest') {
      sorted.sort((a, b) => a.updatedAt - b.updatedAt);
    } else {
      sorted.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return sorted;
  }, [tickets, desk, filter, priority, query, sort]);

  const detailOpen = Boolean(selected) || composing;

  return (
    <div className="flex h-full min-h-0 flex-col p-4 sm:p-6 lg:p-8">
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <LifeBuoy size={22} className="text-gray-400" />
            {desk ? 'IT tickets' : 'IT support'}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {desk
              ? 'Every issue reported to IT. Only this account can see this page.'
              : 'Something not working? Tell IT here. Only IT sees what you send.'}
          </p>
        </div>
        {!desk && (
          <button
            type="button"
            onClick={() => go({ new: true })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <Plus size={16} /> Report an issue
          </button>
        )}
      </div>

      {desk && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Needs a reply" value={counts.needs} Icon={Inbox} tone="text-red-600" onClick={() => setFilter('needs')} />
          <Stat label="Open" value={counts.open} Icon={LifeBuoy} tone="text-blue-600" onClick={() => setFilter('open')} />
          <Stat label="High or urgent, open" value={counts.urgent} Icon={AlertTriangle} tone="text-orange-600"
            onClick={() => { setFilter('open'); setSort('urgent'); }} />
          <Stat label="Finished in the last 7 days" value={counts.resolved} Icon={CheckCircle2} tone="text-green-600"
            onClick={() => setFilter('resolved')} />
        </div>
      )}

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex min-h-0 flex-1 gap-4 lg:min-h-[480px]">
        {/* The list */}
        <section
          className={`min-h-0 w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white lg:flex lg:w-[400px] lg:flex-shrink-0 ${
            detailOpen ? 'hidden' : 'flex'
          }`}
        >
          <div className="flex-shrink-0 space-y-2 border-b border-gray-200 p-3">
            <label className="relative block">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={desk ? 'Search title, person, number' : 'Search your tickets'}
                className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-sm text-gray-900 focus:border-brand-500 focus:outline-none"
              />
            </label>
            {desk && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {FILTERS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={filter === f.id}
                      onClick={() => setFilter(f.id)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                        filter === f.id
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {f.label} <span className="text-gray-400">{counts.byFilter[f.id]}</span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as ItTicketPriority | '')}
                    className="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900"
                    aria-label="Priority"
                  >
                    <option value="">Any priority</option>
                    {IT_TICKET_PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                  </select>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as DeskSort)}
                    className="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900"
                    aria-label="Sort"
                  >
                    <option value="urgent">Most urgent first</option>
                    <option value="oldest">Waiting longest first</option>
                    <option value="newest">Newest activity first</option>
                  </select>
                </div>
              </>
            )}
          </div>

          <ul className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto">
            {tickets === null ? (
              <li className="flex justify-center p-8"><Loader2 size={20} className="animate-spin text-gray-400" /></li>
            ) : shown.length === 0 ? (
              <li className="p-8 text-center text-sm text-gray-500">
                {desk
                  ? filter === 'needs' ? 'Nothing waiting on IT. Nice.' : 'No tickets here.'
                  : 'You have not reported anything yet.'}
              </li>
            ) : shown.map((t) => {
              const unread = desk ? t.needsIt && isOpenStatus(t.status) : t.reporterUnread;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => go({ ticket: t.id })}
                    className={`block w-full px-3 py-2.5 text-left transition ${
                      selected === t.id ? 'bg-brand-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {unread && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500" title={desk ? 'Waiting on IT' : 'New answer from IT'} />}
                      <span className="text-[11px] font-semibold text-gray-400">{ticketNumberLabel(t.number)}</span>
                      <span className="ml-auto flex items-center gap-1">
                        {desk && t.priority !== 'normal' && <PriorityChip priority={t.priority} />}
                        <StatusChip status={t.status} desk={desk} />
                      </span>
                    </div>
                    <p className={`mt-0.5 truncate text-sm ${unread ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>
                      {t.title}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {t.lastMessageFromIt ? 'IT: ' : desk ? `${t.reporterName}: ` : 'You: '}
                      {t.lastMessageText}
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-400">
                      {desk && <span className="truncate">{t.reporterName}</span>}
                      <span>{CATEGORY_SHORT[t.category]}</span>
                      {t.attachmentCount > 0 && (
                        <span className="inline-flex items-center gap-0.5"><Paperclip size={10} />{t.attachmentCount}</span>
                      )}
                      <span className="ml-auto whitespace-nowrap">{formatDateTime(t.updatedAt ? new Date(t.updatedAt) : null)}</span>
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* The open ticket, or the form */}
        <section
          className={`min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white ${
            detailOpen ? 'block' : 'hidden lg:block'
          }`}
        >
          {composing && !desk ? (
            <div className="h-full overflow-y-auto">
              <NewTicketForm
                onCreated={(t) => { onChanged(t); go({ ticket: t.id }); }}
                onCancel={tickets && tickets.length > 0 ? () => go({}) : undefined}
              />
            </div>
          ) : selected ? (
            <TicketThread
              key={selected}
              ticketId={selected}
              desk={desk}
              onChanged={onChanged}
              onBack={() => go({})}
            />
          ) : (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 p-8 text-center text-sm text-gray-500">
              <LifeBuoy size={28} className="text-gray-300" />
              {desk ? 'Pick a ticket on the left to read and answer it.' : 'Pick a ticket to see the conversation, or report a new issue.'}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, Icon, tone, onClick }: {
  label: string;
  value: number;
  Icon: typeof Inbox;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left transition hover:border-brand-300 hover:bg-gray-50"
    >
      <Icon size={20} className={tone} />
      <span>
        <span className="block text-xl font-bold leading-none text-gray-900">{value}</span>
        <span className="mt-1 block text-xs text-gray-500">{label}</span>
      </span>
    </button>
  );
}
