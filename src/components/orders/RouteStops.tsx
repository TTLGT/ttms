'use client';

import { ArrowRight, CalendarDays, GitCommitVertical, Table2 } from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { useRouteView, type RouteView } from '@/lib/routeView';
import { orderDeliveries, orderPickups, type Order, type OrderStop, type StopKind } from '@/types/order';
import type { Party } from '@/types/party';
import PartyLink from '@/components/parties/PartyLink';
import PartyContact from '@/components/parties/PartyContact';
import TimeZoneBadge from './TimeZoneBadge';
import { Pill } from './DetailBits';

function cityLine(s: OrderStop): string {
  const a = s.address;
  return [a?.city, [a?.state, a?.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

function shortPlace(s: OrderStop | undefined): string {
  if (!s) return '';
  return [s.address?.city, s.address?.state].filter(Boolean).join(', ');
}

/*
 * Pickups are blue and deliveries green, on the dot and the chip, in both
 * views. Class strings are written out in full so Tailwind finds them.
 */
const KIND = {
  pickup:   { dot: 'bg-blue-500', chip: 'blue' as const,  role: 'Shipper' },
  delivery: { dot: 'bg-green-500', chip: 'green' as const, role: 'Consignee' },
};

type Row = { kind: StopKind; stop: OrderStop; n: number; many: boolean };

/**
 * The Timeline / Table switch drawn beside the Route card's Edit link. The
 * choice is the person's own and follows them to any computer — see
 * src/lib/routeView.ts.
 */
export function RouteViewSwitch() {
  const { view, setView } = useRouteView();
  const options: { id: RouteView; label: string; Icon: typeof Table2 }[] = [
    { id: 'timeline', label: 'Timeline', Icon: GitCommitVertical },
    { id: 'table', label: 'Table', Icon: Table2 },
  ];
  return (
    <div role="group" aria-label="Show the stops as" className="inline-flex gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
      {options.map(({ id, label, Icon }) => {
        const on = view === id;
        return (
          <button key={id} type="button" aria-pressed={on} title={label} data-es={label}
            onClick={() => setView(id)}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${
              on ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The stops on the order page's Route card, in the order they are driven —
 * every pickup, then every delivery — under a from → to summary.
 *
 * Two drawings of the same list (2026-11-11), switched per person:
 *  - a timeline down the card, the default, which reads best for the
 *    one-pickup, one-delivery loads most of the book is;
 *  - an itinerary table, one row a stop, for scanning many-stop loads.
 *
 * Each stop's date is shown even on a one-pickup, one-delivery load: the
 * General card has them too, but a stop read without its day is half an
 * appointment.
 */
export default function RouteStops({ order, orderId, partyById }: {
  order: Order;
  orderId: string;
  partyById: Record<string, Party | undefined>;
}) {
  const { formatDateRange } = useDateFormatters();
  const { view } = useRouteView();
  const pickups = orderPickups(order);
  const deliveries = orderDeliveries(order);
  const rows: Row[] = [
    ...pickups.map((stop, i) => ({ kind: 'pickup' as const, stop, n: i + 1, many: pickups.length > 1 })),
    ...deliveries.map((stop, i) => ({ kind: 'delivery' as const, stop, n: i + 1, many: deliveries.length > 1 })),
  ];
  const from = shortPlace(pickups[0]);
  const to = shortPlace(deliveries[deliveries.length - 1]);
  const stopName = (r: Row) => `${r.kind === 'pickup' ? 'Pickup' : 'Delivery'}${r.many ? ` ${r.n}` : ''}`;

  return (
    <div>
      {(from || to) && (
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          <span className="text-base font-semibold text-gray-900">{from || '—'}</span>
          <ArrowRight className="h-4 w-4 text-gray-400" />
          <span className="text-base font-semibold text-gray-900">{to || '—'}</span>
          <span className="ml-auto text-xs text-gray-500">
            {pickups.length} {pickups.length === 1 ? 'pickup' : 'pickups'} · {deliveries.length} {deliveries.length === 1 ? 'delivery' : 'deliveries'}
          </span>
        </div>
      )}

      {view === 'table' ? (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th data-es className="px-3 py-2.5">Stop</th>
                <th data-es className="px-3 py-2.5">Company</th>
                <th data-es className="px-3 py-2.5">Address</th>
                <th data-es className="px-3 py-2.5">Window</th>
                <th data-es className="px-3 py-2.5">Local time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const street = r.stop.address?.street?.trim();
                const city = cityLine(r.stop);
                return (
                  <tr key={`${r.kind}-${r.n}`} className="border-b border-gray-100 align-top last:border-0">
                    <td className="px-3 py-2.5"><Pill tone={KIND[r.kind].chip}>{stopName(r)}</Pill></td>
                    <td className="px-3 py-2.5 font-medium">
                      <PartyLink id={r.stop.partyId} name={r.stop.partyName} fromOrderId={orderId} />
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {street || city ? (<>{street && <div>{street}</div>}{city && <div className={street ? 'text-gray-500' : ''}>{city}</div>}</>)
                        : <span data-es className="text-amber-700">No address</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-gray-700">{formatDateRange(r.stop.date, r.stop.dateEnd)}</td>
                    <td className="px-3 py-2.5"><TimeZoneBadge address={r.stop.address} on={r.stop.date} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <ol className="relative">
          {rows.map((r, i) => {
            const k = KIND[r.kind];
            const last = i === rows.length - 1;
            const street = r.stop.address?.street?.trim();
            const city = cityLine(r.stop);
            const when = formatDateRange(r.stop.date, r.stop.dateEnd, '');
            return (
              <li key={`${r.kind}-${r.n}`} className="relative flex gap-4 pb-6 last:pb-0">
                {/* The rail: a dot per stop and a line down to the next. The
                    ring is the card's own colour, so the line stops short of
                    each dot in either theme. */}
                <div className="relative flex w-3 shrink-0 justify-center">
                  <span className={`relative z-10 mt-1.5 h-3 w-3 rounded-full ring-4 ring-white ${k.dot}`} />
                  {!last && <span className="absolute top-4 bottom-[-1.5rem] w-0.5 bg-gray-200" aria-hidden />}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={k.chip}>{stopName(r)}</Pill>
                    <span data-es className="text-xs text-gray-500">{k.role}</span>
                    {when && (
                      <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-gray-700">
                        <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
                        {when}
                      </span>
                    )}
                  </div>

                  <p className="mt-1.5 text-sm font-semibold">
                    <PartyLink id={r.stop.partyId} name={r.stop.partyName} fromOrderId={orderId} />
                  </p>
                  <PartyContact party={partyById[r.stop.partyId ?? '']} />

                  <div className="mt-1.5 text-sm text-gray-700">
                    {street || city ? (
                      <>
                        {street && <p>{street}</p>}
                        {city && <p className={street ? 'text-gray-500' : ''}>{city}</p>}
                      </>
                    ) : <p data-es className="text-amber-700">No address</p>}
                  </div>
                  <TimeZoneBadge address={r.stop.address} on={r.stop.date} className="mt-1.5" />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
