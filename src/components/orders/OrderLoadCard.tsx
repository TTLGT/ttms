'use client';

import { Check, PackageOpen, Truck } from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { usd } from '@/types/paymentMethod';
import {
  STATUS_LABEL, dockEndText, displayStatus, formatLaneMiles, laneMilesCaption, orderDeliveries, orderPickups,
} from '@/types/order';
import type { Order, OrderStatus } from '@/types/order';
import { Bi } from '@/components/spanish/Es';

/**
 * The top of the order page: the whole load in one card.
 *
 * Who it is for and what it is, where it goes (first pickup to last delivery,
 * with the dates and the miles), what it pays, and how far along it is. Before
 * this, the route and the money were each several screens down, so the one
 * question everybody opens a load to answer — what is this and where is it —
 * took a scroll to answer.
 *
 * Everything here is read off the order the page already has. Nothing is
 * fetched, and nothing is worked out that is not stored: the miles are the
 * stored `laneMiles` (labelled as an estimate when they are one, as
 * everywhere), and the fee is the stored `brokerFee`, not a subtraction.
 */

const PIPELINE: OrderStatus[] = [
  'quote', 'booked', 'shipper_signed', 'carrier_signed', 'in_transit', 'delivered', 'completed',
];

/**
 * How far along the route line the truck sits at each status. The paperwork
 * steps barely move it — the truck has not left — and In Transit puts it half
 * way, because that is all a status can say about where it is.
 */
const TRUCK_AT: Record<string, number> = {
  quote: 0, booked: 4, shipper_signed: 10, carrier_signed: 18, in_transit: 55, delivered: 100, completed: 100,
};

/** What each step waits on — the hover text on a step not reached yet. */
const STEP_NEEDS: Record<string, string> = {
  quote:          'Priced, and waiting for the client to accept.',
  booked:         'The client accepted. Dispatch reviews the load and sends the Shipper Agreement (SA).',
  shipper_signed: 'The client signs the SA. Moves on by itself when they e-sign.',
  carrier_signed: 'The carrier signs the Dispatch Sheet. Moves on by itself when they e-sign.',
  in_transit:     'The driver reports picking up the load on their trip link.',
  delivered:      'The driver taps Delivered on their trip link, with a picture.',
  completed:      'The client and the driver are both paid, each recorded with proof.',
};

function place(city?: string, state?: string): string {
  return [city, state].filter(Boolean).join(', ');
}

/**
 * Who loads or unloads, under that end of the route — the question a broker,
 * a dispatcher and a driver each ask, answered where they are already
 * looking. Amber while unanswered, because the SA cannot go out without it.
 */
function DockLine({ order, end, right }: { order: Order; end: 'pickup' | 'delivery'; right?: boolean }) {
  const text = dockEndText(order, end);
  const verb = end === 'pickup' ? 'Loaded by' : 'Unloaded by';
  return (
    <p className={`mt-1 flex items-start gap-1 text-xs ${right ? 'sm:justify-end' : ''} ${text ? 'text-gray-700' : 'text-amber-700'}`}>
      <PackageOpen className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        {text ? <><span data-es className="text-gray-500">{verb}:</span> {text}</> : <Bi>{end === 'pickup' ? 'Who loads? Not set' : 'Who unloads? Not set'}</Bi>}
      </span>
    </p>
  );
}

export default function OrderLoadCard({ order, thumb, title, sub, actions }: {
  order: Order;
  /** The load's picture button — the page owns what clicking it does. */
  thumb: React.ReactNode;
  /** Number, status and badges, as the page draws them. */
  title: React.ReactNode;
  /** Client, freight, alternative numbers. */
  sub: React.ReactNode;
  actions: React.ReactNode;
}) {
  const { formatDate, formatDateRange } = useDateFormatters();
  const status = displayStatus(order.status);
  const cancelled = order.status === 'cancelled';
  const current = PIPELINE.indexOf(status);

  const pickups = orderPickups(order);
  const deliveries = orderDeliveries(order);
  const from = pickups[0];
  const to = deliveries[deliveries.length - 1];
  const fromPlace = place(from?.address?.city, from?.address?.state);
  const toPlace = place(to?.address?.city, to?.address?.state);
  const truckAt = cancelled ? 0 : TRUCK_AT[status] ?? 0;
  const stopsBetween = pickups.length + deliveries.length - 2;

  const rate = order.agreedRate || 0;
  const pay = order.carrierPay || 0;
  const fee = order.brokerFee || 0;

  // When each finished step happened, where the order records it. A step with
  // no date of its own (Booked) just says it is done.
  const doneNote: Partial<Record<OrderStatus, string>> = {
    quote: formatDate(order.createdAt as { toDate: () => Date } | null, ''),
    shipper_signed: order.shipperSignedAt
      ? `${order.shipperSignerName || 'The client'} · ${formatDate(order.shipperSignedAt as { toDate: () => Date })}`
      : order.clientSignatureRecord ? 'Recorded from a signed copy' : '',
    carrier_signed: order.carrierSignedAt
      ? `${order.carrierSignerName || 'The carrier'} · ${formatDate(order.carrierSignedAt as { toDate: () => Date })}`
      : order.carrierSignatureRecord ? 'Recorded from a signed copy' : '',
    in_transit: formatDate(order.pickedUpAt as { toDate: () => Date } | null, ''),
    delivered: formatDate(order.deliveredAt as { toDate: () => Date } | null, ''),
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      {/* A thin band of the section colours: route, carrier, money. */}
      <div className="h-1 bg-gradient-to-r from-blue-500 via-violet-500 to-emerald-500" aria-hidden />
      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            {thumb}
            <div className="min-w-0">{title}{sub}</div>
          </div>
          <div className="flex flex-wrap gap-2">{actions}</div>
        </div>

        {/* Where it goes, and what it pays */}
        <div className="grid items-center gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,10rem)_1fr_minmax(0,10rem)]">
            <div className="min-w-0">
              <p className="truncate font-[family-name:var(--font-rajdhani)] text-xl font-bold leading-tight text-gray-900">{fromPlace || <span className="text-gray-400"><Bi>Pickup not set</Bi></span>}</p>
              <p className="text-xs text-gray-500">{formatDateRange(from?.date ?? null, from?.dateEnd ?? null, '') || <Bi>No pickup date</Bi>}</p>
              <DockLine order={order} end="pickup" />
            </div>
            <div className="min-w-0">
              <div className="relative h-[34px]" aria-hidden>
                <div className="absolute inset-x-0 top-[15px] h-1 rounded-full bg-gray-200" />
                <div className="absolute left-0 top-[15px] h-1 rounded-full bg-blue-500 transition-[width] duration-1000 ease-out motion-reduce:transition-none"
                  style={{ width: `${truckAt}%` }} />
                <div className={`absolute top-0 flex h-[34px] w-[34px] -translate-x-1/2 items-center justify-center rounded-full text-white shadow ring-4 transition-[left] duration-1000 ease-out motion-reduce:transition-none ${cancelled ? 'bg-gray-400 ring-gray-100' : 'bg-blue-600 ring-blue-100'}`}
                  style={{ left: `clamp(17px, ${truckAt}%, calc(100% - 17px))` }}>
                  <Truck className="h-4 w-4" />
                </div>
              </div>
              {/* In the flow below the track, not laid over it: the truck moves
                  along the line, so any caption on the line ends up under it. */}
              {(order.laneMiles || stopsBetween > 0) && (
                <p className="mt-2 text-center text-[11px] leading-snug text-gray-500">
                  {order.laneMiles ? `${formatLaneMiles(order.laneMiles, order.laneMilesSource)} · ${laneMilesCaption(order.laneMilesSource)}` : ''}
                  {order.laneMiles && stopsBetween > 0 ? ' · ' : ''}
                  {stopsBetween > 0 ? `${stopsBetween} more stop${stopsBetween > 1 ? 's' : ''}` : ''}
                </p>
              )}
            </div>
            <div className="min-w-0 sm:text-right">
              <p className="truncate font-[family-name:var(--font-rajdhani)] text-xl font-bold leading-tight text-gray-900">{toPlace || <span className="text-gray-400"><Bi>Delivery not set</Bi></span>}</p>
              <p className="text-xs text-gray-500">{formatDateRange(to?.date ?? null, to?.dateEnd ?? null, '') || <Bi>No delivery date</Bi>}</p>
              <DockLine order={order} end="delivery" right />
            </div>
          </div>

          <dl className="flex gap-5 tabular-nums lg:border-l lg:border-gray-200 lg:pl-5">
            <div>
              <dt data-es className="text-[11px] font-medium text-gray-500">Client pays</dt>
              <dd className="text-lg font-semibold text-gray-900">{rate ? usd(rate) : '—'}</dd>
            </div>
            <div>
              <dt data-es className="text-[11px] font-medium text-gray-500">Carrier pay</dt>
              <dd className="text-lg font-semibold text-gray-900">{pay ? usd(pay) : '—'}</dd>
            </div>
            <div>
              <dt data-es className="text-[11px] font-medium text-gray-500">Our fee</dt>
              <dd className="text-lg font-semibold text-emerald-600">
                {fee ? usd(fee) : '—'}
                {fee && rate ? <span className="ml-1 text-xs font-medium text-gray-500">{((fee / rate) * 100).toFixed(1)}%</span> : null}
              </dd>
            </div>
          </dl>
        </div>

        {/* The steps. Hover (or tab to) one to see what it waits on, or when
            it happened. */}
        {cancelled ? (
          <p className="rounded-xl bg-gray-50 px-4 py-2.5 text-sm text-gray-600"><Bi>This load was cancelled.</Bi></p>
        ) : (
          <ol className="grid grid-cols-7">
            {PIPELINE.map((s, i) => {
              const done = i < current || (i === current && s === 'completed');
              const now = i === current && !done;
              const note = done ? doneNote[s] : '';
              return (
                <li key={s} tabIndex={0}
                  className="group relative flex flex-col items-center gap-1.5 rounded-lg px-0.5 outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
                  {i > 0 && (
                    <span aria-hidden className={`absolute right-1/2 top-[14px] h-[3px] w-full ${i <= current ? 'bg-brand-500' : 'bg-gray-200'}`} />
                  )}
                  <span className={`relative z-[1] flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 text-xs font-bold transition
                    ${done ? 'border-brand-600 bg-brand-600 text-white' : ''}
                    ${now ? 'border-brand-600 bg-white text-brand-600 ring-4 ring-brand-100' : ''}
                    ${!done && !now ? 'border-gray-200 bg-white text-gray-400' : ''}`}>
                    {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  <span data-es={STATUS_LABEL[s]} className={`text-center text-[11px] leading-tight sm:text-xs ${now ? 'font-semibold text-brand-700' : done ? 'text-gray-700' : 'text-gray-400'}`}>
                    {STATUS_LABEL[s]}
                  </span>
                  <span role="tooltip"
                    className={`pointer-events-none absolute bottom-full z-20 mb-2 w-56 rounded-lg bg-gray-900 px-3 py-2 text-left text-xs text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100
                      ${i === 0 ? 'left-0' : i === PIPELINE.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}>
                    <span className="block font-semibold">
                      {STATUS_LABEL[s]}{done ? ' · done' : now ? ' · you are here' : ''}
                    </span>
                    <span className="block text-white/80">
                      {done ? (note || 'Done.') : now && PIPELINE[i + 1] ? `Next: ${STEP_NEEDS[PIPELINE[i + 1]]}` : STEP_NEEDS[s]}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
