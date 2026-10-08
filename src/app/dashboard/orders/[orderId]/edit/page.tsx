'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Timestamp } from 'firebase/firestore';
import { getOrder, updateOrder } from '@/lib/orders';
import { listParties, tagPartyRole } from '@/lib/parties';
import PartyCombobox from '@/components/parties/PartyCombobox';
import type { PartySelection } from '@/components/parties/PartyCombobox';
import CommodityItemsFields from '@/components/orders/CommodityItemsFields';
import PriceAndTermsSection, { blankPriceTerms, priceTermsForSave, priceTermsFromOrder } from '@/components/orders/PriceAndTermsSection';
import type { PriceTerms } from '@/components/orders/PriceAndTermsSection';
import DimensionConverter from '@/components/orders/DimensionConverter';
import RouteMapLinkField from '@/components/orders/RouteMapLinkField';
import RouteDistanceField from '@/components/orders/RouteDistanceField';
import type { LaneDistanceValue } from '@/components/orders/RouteDistanceField';
import AddressFields, { BLANK_ADDRESS } from '@/components/orders/AddressFields';
import ExtraStopsFields, { afterRemoving, savedStopIndex, stopChoices, stopDraftsFrom, stopPartyIdsIn, stopsForSave, stopsProblem } from '@/components/orders/ExtraStopsFields';
import type { StopDraft } from '@/components/orders/ExtraStopsFields';
import { commoditySummary, hasVehicleDetails, orderCommodityItems, remapItemStops, totalPieces, totalWeightLb, totalCommodityValue, orderDisplayNumber } from '@/types/order';
import type { Order, Address, CommodityItem, StopKind } from '@/types/order';
import type { Party, PartyRole } from '@/types/party';
import { ROLE_LABEL } from '@/types/party';
import LeadSourceField from '@/components/orders/LeadSourceField';
import { canEditSource } from '@/lib/accessControl';
import { toDate } from '@/lib/dateFormat';
import { useAuth } from '@/context/AuthContext';
import DateField from '@/components/DateField';
import DateRangeField, { dateRangeProblem } from '@/components/DateRangeField';
import { ORDER_SECTION_LABEL, isOrderSection } from '@/components/orders/SectionEditLink';
import type { OrderSection } from '@/components/orders/SectionEditLink';

function tsToDateStr(ts: Order['pickupDate']): string {
  if (!ts || typeof (ts as { toDate?: unknown }).toDate !== 'function') return '';
  return (ts as { toDate: () => Date }).toDate().toISOString().slice(0, 10);
}

/**
 * Names typed into a party box that never became a record.
 *
 * The picker binds a name to a real party when one exists and opens the full
 * add-a-record form when it does not, so an unbound name means somebody typed
 * something and moved on. The order must not be saved against it: it would
 * carry a client name with no client behind it — no phone, no email, no
 * address, and nothing for an agreement to be addressed to.
 */
function unboundParties(
  entries: readonly (readonly [PartyRole, PartySelection])[],
): string[] {
  return entries
    .filter(([, sel]) => !sel.id && sel.name.trim())
    .map(([role, sel]) => `${ROLE_LABEL[role]} "${sel.name.trim()}"`);
}

/** The sentence shown when one is found. */
function unboundMessage(unbound: string[]): string {
  return `${unbound.join(' and ')} ${unbound.length > 1 ? 'are' : 'is'} not on file yet. `
    + 'Pick an existing record from the list, or add it with its full details.';
}

export default function EditOrderPage() {
  const { user, profile } = useAuth();
  const params   = useParams();
  const orderId  = params.orderId as string;
  const router   = useRouter();
  // Set when opened from one card's Edit on the order page: only that section
  // is drawn, and only its fields are saved. Absent = the whole order.
  const askedSection = useSearchParams().get('section');
  const section: OrderSection | null = isOrderSection(askedSection) ? askedSection : null;
  const shows = (s: OrderSection) => !section || section === s;
  // Back to the card the edit started from, not the top of the page.
  const backHref = `/dashboard/orders/${orderId}${section ? `#${section}` : ''}`;

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [order, setOrder]       = useState<Order | null>(null);
  const [parties, setParties] = useState<Party[]>([]);

  const [client, setClient]       = useState<PartySelection>({ id: '', name: '' });
  const [shipper, setShipper]     = useState<PartySelection>({ id: '', name: '' });
  const [consignee, setConsignee] = useState<PartySelection>({ id: '', name: '' });
  const [commodities, setCommodities]   = useState<CommodityItem[]>([]);
  const [origin, setOrigin]             = useState<Address>(BLANK_ADDRESS);
  const [destination, setDest]          = useState<Address>(BLANK_ADDRESS);
  const [extraPickups, setExtraPickups]       = useState<StopDraft[]>([]);
  const [extraDeliveries, setExtraDeliveries] = useState<StopDraft[]>([]);
  const [routeMapUrl, setRouteMapUrl]   = useState('');
  const [distance, setDistance]         = useState<LaneDistanceValue>({ laneMiles: null, laneMilesSource: null, laneMilesAt: null });
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [firstAvailable, setFirstAvailable] = useState('');
  const [pickupDate, setPickupDate]     = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [pickupDateEnd, setPickupDateEnd]     = useState('');
  const [deliveryDateEnd, setDeliveryDateEnd] = useState('');
  const [agreedRate, setAgreedRate]     = useState('');
  const [brokerFee, setBrokerFee]       = useState('');
  const [notes, setNotes]               = useState('');
  const [priceTerms, setPriceTerms]     = useState<PriceTerms>(blankPriceTerms);

  const carrierPay = (parseFloat(agreedRate) || 0) - (parseFloat(brokerFee) || 0);

  // Narrower than the right to edit the order at all — dispatch and finance can
  // work a load without being able to change what it is credited to.
  const canEditThisSource = !!user && !!order && canEditSource(order, user.uid, profile);

  // Every stop in driving order, for the mileage and the map link.
  const tripStops = [
    origin, ...extraPickups.map((d) => d.address),
    destination, ...extraDeliveries.map((d) => d.address),
  ];

  // The legacy single-value fields are kept in sync from the items — see the
  // note on Order.commodity.
  // Each line's stops renumbered to where they land once blank stops are
  // dropped on save — see savedStopIndex.
  const commodityItems = remapItemStops(
    remapItemStops(commodities.filter((c) => c.description.trim() || c.weight || c.length || c.width || c.height || c.value != null || hasVehicleDetails(c)), 'pickup', savedStopIndex(extraPickups)),
    'delivery', savedStopIndex(extraDeliveries),
  );

  // What each line can be picked up at and delivered to, numbered as on screen.
  const pickupChoices = stopChoices('pickup', { name: shipper.name, address: origin }, extraPickups);
  const deliveryChoices = stopChoices('delivery', { name: consignee.name, address: destination }, extraDeliveries);

  // A stop taken out moves every line that pointed past it up by one, and
  // leaves the lines that pointed at it unsaid.
  const removeStop = (kind: StopKind) => (index: number) =>
    setCommodities((items) => remapItemStops(items, kind, afterRemoving(index)));

  useEffect(() => {
    async function load() {
      try {
        const [access, ss] = await Promise.all([getOrder(orderId), listParties()]);
        if (access.status !== 'ok') {
          // "Order not found" covered both cases and was wrong about the one
          // that actually happens — the load exists and belongs to somebody.
          setError(
            access.status === 'missing'
              ? 'This order no longer exists.'
              : access.ownerName
                ? `This order belongs to ${access.ownerName}. Ask them to add you to it.`
                : 'You do not have access to this order.',
          );
          return;
        }
        const o = access.order;
        setOrder(o);
        setParties(ss);
        setClient({    id: o.clientId    ?? '', name: o.clientName    ?? '' });
        setShipper({   id: o.shipperId   ?? '', name: o.shipperName   ?? '' });
        setConsignee({ id: o.consigneeId ?? '', name: o.consigneeName ?? '' });
        // Orders written before itemised freight existed come back as a
        // single line, so the editor has something to open on.
        setCommodities(orderCommodityItems(o));
        setOrigin(o.origin ?? BLANK_ADDRESS);
        setDest(o.destination ?? BLANK_ADDRESS);
        setExtraPickups(stopDraftsFrom(o.extraPickups));
        setExtraDeliveries(stopDraftsFrom(o.extraDeliveries));
        setRouteMapUrl(o.routeMapUrl ?? '');
        setDistance({
          laneMiles:       o.laneMiles ?? null,
          laneMilesSource: o.laneMilesSource ?? null,
          // Through toDate() because the order came over the API, where a
          // timestamp arrives as `{_seconds}`. Saved back as-is that would
          // write a map into the field — see toDate in src/lib/dateFormat.ts.
          laneMilesAt:     toDate(o.laneMilesAt),
        });
        setSourceId(o.sourceId ?? null);
        setFirstAvailable(tsToDateStr(o.firstAvailablePickup));
        setPickupDate(tsToDateStr(o.pickupDate));
        setDeliveryDate(tsToDateStr(o.deliveryDate));
        setPickupDateEnd(tsToDateStr(o.pickupDateEnd ?? null));
        setDeliveryDateEnd(tsToDateStr(o.deliveryDateEnd ?? null));
        setAgreedRate(o.agreedRate ? String(o.agreedRate) : '');
        setBrokerFee(o.brokerFee ? String(o.brokerFee) : '');
        setNotes(o.notes ?? '');
        setPriceTerms(priceTermsFromOrder(o));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load order');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [orderId]);

  function cacheParty(p: Party) {
    setParties((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
  }

  async function tagRoleIfNew(partyId: string, role: PartyRole) {
    const p = parties.find((x) => x.id === partyId);
    if (p && (p.roles ?? []).includes(role)) return;
    await tagPartyRole(partyId, role);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;

    // Only the parties on screen — a section edit must not be refused over a
    // box the person cannot see.
    const partyBoxes = ([
      ['client', client], ['shipper', shipper], ['consignee', consignee],
    ] as const).filter(([role]) => shows(role === 'client' ? 'general' : 'route'));
    const unbound = unboundParties(partyBoxes);
    if (unbound.length) { setError(unboundMessage(unbound)); return; }
    const badRange = shows('general')
      ? dateRangeProblem('Pickup Date', pickupDate, pickupDateEnd)
        || dateRangeProblem('Delivery Date', deliveryDate, deliveryDateEnd)
      : '';
    if (badRange) { setError(badRange); return; }
    const badStop = shows('route')
      ? stopsProblem('pickup', extraPickups) || stopsProblem('delivery', extraDeliveries)
      : '';
    if (badStop) { setError(badStop); return; }

    setError('');
    setSaving(true);
    try {
      // Reassigning a party to a role it has not held before must show up in
      // that role's list — the extra stops' parties too, when they are on screen.
      const partyRoles: [PartyRole, string][] = [
        ...partyBoxes.map(([role, sel]): [PartyRole, string] => [role, sel.id]),
        ...(shows('route') ? [
          ...stopPartyIdsIn(extraPickups).map((pid): [PartyRole, string] => ['shipper', pid]),
          ...stopPartyIdsIn(extraDeliveries).map((pid): [PartyRole, string] => ['consignee', pid]),
        ] : []),
      ];
      await Promise.all(
        partyRoles
          .filter(([, pid]) => pid)
          // Best-effort: a party used under an approval is not writable by the
          // requester, and failing to tag a role must not block the order.
          .map(([role, pid]) => tagRoleIfNew(pid, role).catch(() => {})),
      );

      const ts = (d: string) => (d ? Timestamp.fromDate(new Date(d + 'T12:00:00')) : null);

      // Whether any freight line now points at a different stop than the one
      // on file — which, from the Route card, only a removed stop can cause.
      // Compared by line id, so an order whose lines were never itemised (or
      // carry a blank one the save would drop) does not read as changed.
      const stopsOf = (items: CommodityItem[]) =>
        new Map(items.map((c) => [c.id, `${c.pickupStop ?? ''}/${c.deliveryStop ?? ''}`]));
      const onFile = order ? stopsOf(orderCommodityItems(order)) : new Map<string, string>();
      const stopsRenumbered = commodityItems.some((c) =>
        onFile.has(c.id) && onFile.get(c.id) !== `${c.pickupStop ?? ''}/${c.deliveryStop ?? ''}`);

      // Split by section so a one-section save writes that section and
      // nothing else. Writing the whole form back would overwrite whatever a
      // colleague changed elsewhere on the load since this page was opened —
      // with values this person never even saw.
      const patches: Record<OrderSection, Partial<Order>> = {
        general: {
          clientId:      client.id,
          clientName:    client.name.trim(),
          // Only sent when this user is allowed to change it. Writing the same
          // value back would still be a write to the field, and the rules reject
          // any touch of it from someone who is neither an admin nor an owner —
          // which would fail the whole save, not just this field.
          ...(canEditThisSource ? { sourceId } : {}),
          firstAvailablePickup: ts(firstAvailable),
          pickupDate:      ts(pickupDate),
          deliveryDate:    ts(deliveryDate),
          pickupDateEnd:   ts(pickupDateEnd),
          deliveryDateEnd: ts(deliveryDateEnd),
        },
        freight: {
          commodity:    commoditySummary(commodityItems),
          commodities:  commodityItems,
          commodityValue: totalCommodityValue(commodityItems),
          pieces:       totalPieces(commodityItems) || 1,
          weight:       Math.round(totalWeightLb(commodityItems)),
        },
        price: {
          agreedRate:   parseFloat(agreedRate) || 0,
          brokerFee:    parseFloat(brokerFee)  || 0,
          carrierPay:   Math.max(0, carrierPay),
          ...priceTermsForSave(priceTerms),
        },
        route: {
          shipperId:     shipper.id,
          shipperName:   shipper.name.trim(),
          consigneeId:   consignee.id,
          consigneeName: consignee.name.trim(),
          extraPickups:    stopsForSave(extraPickups),
          extraDeliveries: stopsForSave(extraDeliveries),
          origin,
          destination,
          routeMapUrl:  routeMapUrl.trim(),
          laneMiles:       distance.laneMiles,
          laneMilesSource: distance.laneMilesSource,
          laneMilesAt:     distance.laneMilesAt ? Timestamp.fromDate(distance.laneMilesAt) : null,
          // Taking a stop out renumbers the freight lines that point at the
          // stops after it. A Route-only save must carry that too, or the
          // lines would go on naming a position some other company now holds.
          ...(stopsRenumbered ? { commodities: commodityItems } : {}),
        },
        notes: {
          notes:        notes.trim(),
        },
      };

      await updateOrder(orderId, section
        ? patches[section]
        : Object.assign({}, ...Object.values(patches)));
      router.push(backHref);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save order');
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!order) return (
    <div className="p-4 sm:p-6 lg:p-8">
      <p className="text-red-600 text-sm">{error || 'Order not found.'}</p>
      <Link href="/dashboard/orders" className="text-sm text-brand-600 hover:underline mt-2 block">← Orders</Link>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
      <div className="mb-6">
        <Link href={backHref} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-2">
          ← Back to {orderDisplayNumber(order)}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {section ? `Edit ${ORDER_SECTION_LABEL[section]}` : 'Edit Order'}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          <span className="font-mono">{orderDisplayNumber(order)}</span>
          {section && (
            <>
              {' · '}
              <Link href={`/dashboard/orders/${orderId}/edit`} className="text-brand-600 hover:underline">
                Edit the whole order
              </Link>
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
        <form onSubmit={handleSubmit} className="space-y-8">
          {shows('general') && (<>
          {/* General */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">General</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Shipper and consignee sit in Route, above their addresses —
                  same layout as the new-order form. */}
              <div className="col-span-1 sm:col-span-2 sm:max-w-md">
                <PartyCombobox role="client"    label="Client (signs the contract)" parties={parties}
                  value={client}    onChange={setClient}    onPartyCreated={cacheParty} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">First Available Pickup</label>
                <DateField value={firstAvailable} onChange={setFirstAvailable}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                <p className="text-xs text-gray-500 mt-1">Earliest the client says the freight can be collected.</p>
              </div>
              <DateRangeField label="Pickup Date"
                start={pickupDate} end={pickupDateEnd}
                onStartChange={setPickupDate} onEndChange={setPickupDateEnd}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
              <DateRangeField label="Delivery Date"
                start={deliveryDate} end={deliveryDateEnd}
                onStartChange={setDeliveryDate} onEndChange={setDeliveryDateEnd}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
              <LeadSourceField
                value={sourceId}
                onChange={setSourceId}
                canEdit={canEditThisSource}
                fallbackName={order?.sourceName ?? ''}
                hint="Where this load came from. Used for attribution reporting."
              />
            </div>
          </section>
          </>)}

          {shows('freight') && (<>
          {/* Freight */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Freight</h2>
              <p className="text-xs text-gray-500 mt-1">
                One line per commodity, each with its own value, weight and dimensions. Pieces, total value and
                weight are added up for you.
              </p>
            </div>
            <CommodityItemsFields value={commodities} onChange={setCommodities}
              pickups={pickupChoices} deliveries={deliveryChoices} />
          </section>
          </>)}

          {shows('price') && (<>
          <PriceAndTermsSection
            agreedRate={agreedRate} onAgreedRate={setAgreedRate}
            brokerFee={brokerFee} onBrokerFee={setBrokerFee}
            carrierPay={carrierPay}
            laneMiles={distance.laneMiles}
            terms={priceTerms} onTerms={setPriceTerms}
          />
          </>)}

          {shows('route') && (<>
          {/* Route */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Route</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-4">
                <PartyCombobox role="shipper"   label="Shipper (pickup)"     parties={parties}
                  value={shipper}   onChange={setShipper}   onPartyCreated={cacheParty} />
                <AddressFields label="Origin" value={origin} onChange={setOrigin} />
                <ExtraStopsFields kind="pickup" value={extraPickups} onChange={setExtraPickups}
                  parties={parties} onPartyCreated={cacheParty} onRemove={removeStop('pickup')} />
              </div>
              <div className="space-y-4">
                <PartyCombobox role="consignee" label="Consignee (delivery)" parties={parties}
                  value={consignee} onChange={setConsignee} onPartyCreated={cacheParty} />
                <AddressFields label="Destination" value={destination} onChange={setDest} />
                <ExtraStopsFields kind="delivery" value={extraDeliveries} onChange={setExtraDeliveries}
                  parties={parties} onPartyCreated={cacheParty} onRemove={removeStop('delivery')} />
              </div>
            </div>
            <RouteDistanceField
              stops={tripStops}
              value={distance}
              onChange={setDistance}
            />
            <RouteMapLinkField
              stops={tripStops}
              value={routeMapUrl}
              onChange={setRouteMapUrl}
            />
          </section>
          </>)}

          {shows('notes') && (<>
          {/* Notes */}
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Notes</h2>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder="Any special instructions or details…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none" />
          </section>
          </>)}

          {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600">{error}</div>}

          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="px-6 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <Link href={backHref}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition">
              Cancel
            </Link>
          </div>
        </form>

        {/* The converter is for typing freight dimensions — noise anywhere else. */}
        {shows('freight') && <DimensionConverter />}
      </div>
    </div>
  );
}
