'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Timestamp } from 'firebase/firestore';
import { getOrder, updateOrder } from '@/lib/orders';
import { ChangeOrderSubmitted } from '@/lib/changeOrdersClient';
import { listParties, tagPartyRole } from '@/lib/parties';
import PartyCombobox from '@/components/parties/PartyCombobox';
import type { PartySelection } from '@/components/parties/PartyCombobox';
import CommodityItemsFields from '@/components/orders/CommodityItemsFields';
import AccessorialsField from '@/components/orders/AccessorialsField';
import TransportTypeField from '@/components/orders/TransportTypeField';
import PriceAndTermsSection, { agreedRateFrom, blankPriceTerms, priceTermsForSave, priceTermsFromOrder, priceTermsProblem, servicesTotalOf, withDockArrangers } from '@/components/orders/PriceAndTermsSection';
import DockWorkFields, { BLANK_DOCK_WORK, dockWorkForSave, dockWorkFromOrder } from '@/components/orders/DockWorkFields';
import type { DockWork } from '@/components/orders/DockWorkFields';
import type { PriceTerms } from '@/components/orders/PriceAndTermsSection';
import DimensionConverter from '@/components/orders/DimensionConverter';
import RouteMapLinkField from '@/components/orders/RouteMapLinkField';
import NotesAndInstructionsFields, { BLANK_NOTES_AND_INSTRUCTIONS, notesAndInstructionsForSave } from '@/components/orders/NotesAndInstructionsFields';
import type { NotesAndInstructions } from '@/components/orders/NotesAndInstructionsFields';
import RouteDistanceField from '@/components/orders/RouteDistanceField';
import type { LaneDistanceValue } from '@/components/orders/RouteDistanceField';
import { BLANK_ADDRESS } from '@/components/orders/AddressFields';
import StopPartyFields, { incompleteAddressWarning, linkStopAddresses, stopLinkProblem } from '@/components/orders/StopPartyFields';
import { useIncompleteAddressPrompt } from '@/components/orders/IncompleteAddressPrompt';
import ExtraStopsFields, { afterRemoving, savedStopIndex, stopChoices, stopDraftsFrom, stopPartyIdsIn, stopsForAddressCheck, stopsForSave, stopsProblem } from '@/components/orders/ExtraStopsFields';
import type { StopDraft } from '@/components/orders/ExtraStopsFields';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { clientAddedInstructionsOf, commoditySummary, dockLinkedServices, orderAccessorials, withDockServices, serviceChargeLines, serviceChargesTotal, hasVehicleDetails, orderCommodityItems, remapItemStops, totalPieces, totalWeightLb, totalCommodityValue, orderDisplayNumber } from '@/types/order';
import type { Accessorial, Order, Address, CommodityItem, StopKind } from '@/types/order';
import type { Party, PartyRole } from '@/types/party';
import { ROLE_LABEL } from '@/types/party';
import LeadSourceField from '@/components/orders/LeadSourceField';
import { canEditSource } from '@/lib/accessControl';
import { toDate } from '@/lib/dateFormat';
import { useAuth } from '@/context/AuthContext';
import { dateRangeProblem } from '@/components/DateRangeField';
import StopDatesFields from '@/components/orders/StopDatesFields';
import type { StopDates } from '@/components/orders/StopDatesFields';
import PartyRolesGuide from '@/components/orders/PartyRolesGuide';
import LoadFactsFields, { loadFactsForSave, loadFactsFromOrder } from '@/components/orders/LoadFactsFields';
import type { LoadFacts } from '@/components/orders/LoadFactsFields';
import { ORDER_SECTION_LABEL, isOrderSection } from '@/components/orders/SectionEditLink';
import type { OrderSection } from '@/components/orders/SectionEditLink';
import { Bi } from '@/components/spanish/Es';

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
  const { formatDateTime } = useDateFormatters();
  const params   = useParams();
  const orderId  = params.orderId as string;
  const router   = useRouter();
  // Set when opened from one card's Edit on the order page: only that section
  // is drawn, and only its fields are saved. Absent = the whole order.
  const search = useSearchParams();
  const askedSection = search.get('section');
  // Set by a "Fix" link in the SA or Dispatch Sheet review — see fixTargets.ts.
  const askedField = search.get('field');
  // Set by the BOL's "cannot be generated" list (BolMissingNotice): every
  // field the BOL would print blank, outlined in red until it is typed in.
  const missingFields = (search.get('missing') ?? '').split(',').filter((f) => /^[A-Za-z]+$/.test(f));
  const missingKey = missingFields.join(',');
  const section: OrderSection | null = isOrderSection(askedSection) ? askedSection : null;
  const shows = (s: OrderSection) => !section || section === s;
  // Back to the card the edit started from, not the top of the page.
  const backHref = `/dashboard/orders/${orderId}${section ? `#${section}` : ''}`;

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  // The incomplete-address question, drawn by TTMS rather than the browser.
  const addressPrompt = useIncompleteAddressPrompt();
  const [order, setOrder]       = useState<Order | null>(null);
  const [parties, setParties] = useState<Party[]>([]);

  const [client, setClient]       = useState<PartySelection>({ id: '', name: '' });
  const [shipper, setShipper]     = useState<PartySelection>({ id: '', name: '' });
  const [consignee, setConsignee] = useState<PartySelection>({ id: '', name: '' });
  const [commodities, setCommodities]   = useState<CommodityItem[]>([]);
  const [accessorials, setAccessorials] = useState<Accessorial[]>([]);
  const [transportType, setTransportType] = useState('');
  const [origin, setOrigin]           = useState<Address>(BLANK_ADDRESS);
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
  const [carrierPay, setCarrierPay]     = useState('');
  const [brokerFee, setBrokerFee]       = useState('');
  const [notes, setNotes]               = useState<NotesAndInstructions>(BLANK_NOTES_AND_INSTRUCTIONS);
  const [rawPriceTerms, setPriceTerms] = useState<PriceTerms>(blankPriceTerms);
  const [dockWork, setDockWork] = useState<DockWork>(BLANK_DOCK_WORK);
  const [facts, setFacts] = useState<LoadFacts>({ loadType: '', quoteDate: '', clientBudget: '' });

  /*
   * The services and arrangers as they will be saved: what is ticked, plus
   * whatever the Loading and Unloading answers need (a crane hired by the
   * consignee is the Crane line, arranged by the consignee). The save does
   * the same on the server — reconcileDockHelp() — so this is only what the
   * form shows, and why the rate it shows is the rate saved.
   */
  const dockSaved = dockWorkForSave(dockWork);
  const dockLinked = dockLinkedServices(dockSaved);
  const effAccessorials = withDockServices(accessorials, dockSaved);
  const priceTerms = withDockArrangers(rawPriceTerms, dockLinked);

  // Worked out, not typed (2026-11-04): carrier pay + broker fee + additional services.
  const agreedRate = agreedRateFrom(priceTerms, effAccessorials, brokerFee, carrierPay);
  const onFileMismatch = !!order && (Number(order.carrierPay) || 0) > 0 && Math.abs(
    (Number(order.agreedRate) || 0)
    - ((Number(order.carrierPay) || 0) + (Number(order.brokerFee) || 0) + serviceChargesTotal(serviceChargeLines(order))),
  ) >= 0.005;

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

  // The first pickup's and first delivery's dates, drawn inside their stop in
  // Route by the same block the extra stops use — see StopDatesFields.
  function setFirstPickupDates(c: Partial<StopDates>) {
    if (c.date !== undefined) setPickupDate(c.date);
    if (c.dateEnd !== undefined) setPickupDateEnd(c.dateEnd);
    if (c.firstAvailable !== undefined) setFirstAvailable(c.firstAvailable);
  }
  function setFirstDeliveryDates(c: Partial<StopDates>) {
    if (c.date !== undefined) setDeliveryDate(c.date);
    if (c.dateEnd !== undefined) setDeliveryDateEnd(c.dateEnd);
  }

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
        setAccessorials(orderAccessorials(o));
        setTransportType(o.transportType ?? '');
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
        setBrokerFee(o.brokerFee ? String(o.brokerFee) : '');
        // Carrier pay is what is typed now. A load with a rate but none on
        // file (a BATS import with the column blank) gets the rest of its
        // rate, so opening it does not quietly drop the price to the fee.
        {
          const onFile = Number(o.carrierPay) || 0;
          const rest = (Number(o.agreedRate) || 0) - (Number(o.brokerFee) || 0)
            - serviceChargesTotal(serviceChargeLines(o));
          const pay = onFile > 0 ? onFile : Math.max(0, Math.round(rest * 100) / 100);
          setCarrierPay(pay ? String(pay) : '');
        }
        setNotes({
          notes:               o.notes ?? '',
          carrierInstructions: o.carrierInstructions ?? '',
          clientInstructions:  o.clientInstructions ?? '',
        });
        setPriceTerms(priceTermsFromOrder(o));
        setDockWork(dockWorkFromOrder(o));
        setFacts(loadFactsFromOrder(o, (v) => tsToDateStr(v as Order['pickupDate'])));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load order');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [orderId]);

  // Once the form is drawn, take the reviewer to the field they came to fill
  // in: scrolled to, outlined for a few seconds, its first box focused.
  useEffect(() => {
    if (loading || !askedField || !/^[A-Za-z]+$/.test(askedField)) return;
    const el = document.getElementById(`field-${askedField}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.querySelector<HTMLElement>('input:not([type=hidden]):not([disabled]), select, textarea')?.focus({ preventScroll: true });
    // Already outlined in red by the BOL list below; the flash would take
    // that outline's classes away with its own after four seconds.
    if (missingKey.split(',').includes(askedField)) return;
    const ring = ['ring-2', 'ring-amber-400', 'ring-offset-4', 'rounded-lg'];
    el.classList.add(...ring);
    const t = setTimeout(() => el.classList.remove(...ring), 4000);
    return () => clearTimeout(t);
  }, [loading, askedField, missingKey]);

  // The BOL's missing fields stay outlined — not the four-second flash above —
  // because there may be several and the person works down them. Each one's
  // outline comes off at the first thing typed or picked inside it. The
  // outline is a class on the element, not React state: the boxes are drawn
  // by several components, and the ids are the one handle they all share.
  useEffect(() => {
    if (loading || !missingKey) return;
    const ring = ['ring-2', 'ring-red-500', 'ring-offset-4', 'rounded-lg'];
    const cleanups: (() => void)[] = [];
    for (const f of missingKey.split(',')) {
      const el = document.getElementById(`field-${f}`);
      if (!el) continue;
      el.classList.add(...ring);
      const clear = () => el.classList.remove(...ring);
      el.addEventListener('input', clear, { once: true });
      el.addEventListener('change', clear, { once: true });
      cleanups.push(() => {
        clear();
        el.removeEventListener('input', clear);
        el.removeEventListener('change', clear);
      });
    }
    return () => cleanups.forEach((c) => c());
  }, [loading, missingKey]);

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
    // The first stop's dates are part of Route since 2026-11-11.
    const badRange = shows('route')
      ? dateRangeProblem(extraPickups.length ? 'Pickup 1 date' : 'Pickup date', pickupDate, pickupDateEnd)
        || dateRangeProblem(extraDeliveries.length ? 'Delivery 1 date' : 'Delivery date', deliveryDate, deliveryDateEnd)
      : '';
    if (badRange) { setError(badRange); return; }
    const badStop = shows('route')
      ? stopLinkProblem('Pickup', 'shipper', { party: shipper, address: origin })
        || stopLinkProblem('Delivery', 'consignee', { party: consignee, address: destination })
        || stopsProblem('pickup', extraPickups) || stopsProblem('delivery', extraDeliveries)
      : '';
    if (badStop) { setError(badStop); return; }
    const badCharge = shows('price') ? priceTermsProblem(priceTerms, effAccessorials) : '';
    if (badCharge) { setError(badCharge); return; }
    // Asked for whenever the freight is on screen, so an older load without
    // one gets it the first time somebody edits its freight.
    if (shows('freight') && !transportType.trim()) {
      setError('Choose the transport type — the truck or trailer this load moves on.');
      return;
    }

    // An incomplete address is a warning, not a refusal — see
    // incompleteAddressWarning(). Only asked while Route is on screen.
    const gaps = shows('route') ? incompleteAddressWarning([
      { name: extraPickups.length ? 'Pickup 1' : 'Pickup', address: origin },
      ...stopsForAddressCheck('pickup', extraPickups),
      { name: extraDeliveries.length ? 'Delivery 1' : 'Delivery', address: destination },
      ...stopsForAddressCheck('delivery', extraDeliveries),
    ]) : [];
    // Last, after every hard check, so nobody says yes and is then refused.
    if (gaps.length && !(await addressPrompt.ask(gaps))) return;

    setError('');
    setSaving(true);
    try {
      // Every pickup and delivery address belongs to its shipper or
      // consignee — see the same step on the new order form. An address on an
      // older load that its party never had is added the first time the
      // route is saved, which is how those loads become linked.
      if (shows('route')) {
        setParties(await linkStopAddresses([
          { party: shipper, address: origin }, { party: consignee, address: destination },
          ...extraPickups, ...extraDeliveries,
        ], parties));
      }

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
          ...loadFactsForSave(facts),
        },
        freight: {
          commodity:    commoditySummary(commodityItems),
          commodities:  commodityItems,
          commodityValue: totalCommodityValue(commodityItems),
          pieces:       totalPieces(commodityItems) || 1,
          weight:       Math.round(totalWeightLb(commodityItems)),
          accessorials: effAccessorials,
          transportType: transportType.trim(),
          // A ticked or unticked service with a cost moves the Agreed Rate by
          // that cost, or a Freight-only save would leave the rate counting a
          // service the load no longer has. Shifted from the rate on file
          // rather than recomputed, so a figure the client agreed to is not
          // rewritten by a save that never showed it.
          ...(() => {
            const before = serviceChargesTotal(serviceChargeLines(order));
            const after = servicesTotalOf(priceTerms, effAccessorials);
            return before === after ? {} : {
              agreedRate: Math.max(0, Math.round(((Number(order.agreedRate) || 0) + after - before) * 100) / 100),
            };
          })(),
        },
        price: {
          agreedRate,
          brokerFee:    parseFloat(brokerFee)  || 0,
          carrierPay:   parseFloat(carrierPay) || 0,
          // A Price-only save sees the ticks on file, which is what counts.
          ...priceTermsForSave(priceTerms, effAccessorials),
        },
        dock: dockSaved,
        route: {
          shipperId:     shipper.id,
          shipperName:   shipper.name.trim(),
          consigneeId:   consignee.id,
          consigneeName: consignee.name.trim(),
          extraPickups:    stopsForSave(extraPickups),
          extraDeliveries: stopsForSave(extraDeliveries),
          origin,
          destination,
          // The first stop's dates, drawn inside that stop since 2026-11-11 —
          // saved with Route, the card they are now edited from.
          firstAvailablePickup: ts(firstAvailable),
          pickupDate:      ts(pickupDate),
          deliveryDate:    ts(deliveryDate),
          pickupDateEnd:   ts(pickupDateEnd),
          deliveryDateEnd: ts(deliveryDateEnd),
          routeMapUrl:  routeMapUrl.trim(),
          laneMiles:       distance.laneMiles,
          laneMilesSource: distance.laneMilesSource,
          laneMilesAt:     distance.laneMilesAt ? Timestamp.fromDate(distance.laneMilesAt) : null,
          // Taking a stop out renumbers the freight lines that point at the
          // stops after it. A Route-only save must carry that too, or the
          // lines would go on naming a position some other company now holds.
          ...(stopsRenumbered ? { commodities: commodityItems } : {}),
        },
        notes: notesAndInstructionsForSave(notes),
      };

      await updateOrder(orderId, section
        ? patches[section]
        : Object.assign({}, ...Object.values(patches)));
      router.push(backHref);
    } catch (err: unknown) {
      // Filed for dispatch instead of saved: back to the load, where the
      // change order now shows. See src/types/changeOrder.ts.
      if (err instanceof ChangeOrderSubmitted) { router.push(`/dashboard/orders/${orderId}#change-order`); return; }
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
      {addressPrompt.dialog}
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
              <Link data-es href={`/dashboard/orders/${orderId}/edit`} className="text-brand-600 hover:underline">
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
            <h2 data-es className="text-sm font-semibold text-gray-900 uppercase tracking-wide">General</h2>
            <PartyRolesGuide />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Shipper and consignee sit in Route, above their addresses —
                  same layout as the new-order form. So do the dates, inside
                  each stop (2026-11-11). */}
              <div id="field-client" className="col-span-1 sm:col-span-2 sm:max-w-md">
                <PartyCombobox role="client"    label="Client (pays us and signs the SA)" parties={parties}
                  value={client}    onChange={setClient}    onPartyCreated={cacheParty} required />
              </div>
              <LoadFactsFields value={facts} onChange={setFacts} />
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
              <h2 data-es className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Freight</h2>
              <p className="text-xs text-gray-500 mt-1">
                <Bi>One line per commodity, each with its own value, weight and dimensions. Pieces, total value and
                weight are added up for you.</Bi>
              </p>
            </div>
            <div id="field-transportType">
              <TransportTypeField value={transportType} onChange={setTransportType} required />
            </div>
            <div id="field-commodities">
              <CommodityItemsFields value={commodities} onChange={setCommodities}
                pickups={pickupChoices} deliveries={deliveryChoices} />
            </div>
            <div id="field-accessorials">
              <AccessorialsField value={effAccessorials} onChange={setAccessorials}
                locked={Object.keys(dockLinked) as Accessorial[]} />
            </div>
          </section>
          </>)}

          {shows('dock') && <DockWorkFields value={dockWork} onChange={setDockWork}
            pickupState={origin.state} deliveryState={destination.state} />}

          {shows('price') && (<>
          <PriceAndTermsSection
            brokerFee={brokerFee} onBrokerFee={setBrokerFee}
            carrierPay={carrierPay} onCarrierPay={setCarrierPay}
            // Only when the figures on file do not add up (a BATS import kept
            // all three separately) — not merely because a service was added.
            storedAgreedRate={onFileMismatch ? order.agreedRate : null}
            laneMiles={distance.laneMiles}
            terms={priceTerms} onTerms={setPriceTerms}
            commodities={commodities}
            accessorials={effAccessorials}
            dockLinked={dockLinked}
          />
          </>)}

          {shows('route') && (<>
          {/* Route */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h2 data-es className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Route</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-4">
                {/* The first stop in the same box as the extra ones, so a
                    two-pickup load reads as Pickup 1, Pickup 2. */}
                <div className="rounded-lg border border-gray-200 p-4 space-y-4">
                  <p className="text-sm font-semibold text-gray-900">{extraPickups.length ? 'Pickup 1' : 'Pickup'}</p>
                  <StopPartyFields role="shipper" partyLabel="Shipper" addressLabel="Address"
                    hint="Where the truck loads — the company at the pickup dock."
                    parties={parties} value={{ party: shipper, address: origin }}
                    onChange={(v) => { setShipper(v.party); setOrigin(v.address); }}
                    onPartyCreated={cacheParty} partyFieldId="field-shipper" addressFieldId="field-origin"
                    client={client} />
                  <StopDatesFields kind="pickup"
                    value={{ date: pickupDate, dateEnd: pickupDateEnd, firstAvailable }}
                    onChange={setFirstPickupDates}
                    dateFieldId="field-pickupDate" firstAvailableFieldId="field-firstAvailable" />
                </div>
                <ExtraStopsFields kind="pickup" value={extraPickups} onChange={setExtraPickups}
                  parties={parties} onPartyCreated={cacheParty} onRemove={removeStop('pickup')} client={client} />
              </div>
              <div className="space-y-4">
                <div className="rounded-lg border border-gray-200 p-4 space-y-4">
                  <p className="text-sm font-semibold text-gray-900">{extraDeliveries.length ? 'Delivery 1' : 'Delivery'}</p>
                  <StopPartyFields role="consignee" partyLabel="Consignee" addressLabel="Address"
                    hint="Where the truck unloads — who receives the freight."
                    parties={parties} value={{ party: consignee, address: destination }}
                    onChange={(v) => { setConsignee(v.party); setDest(v.address); }}
                    onPartyCreated={cacheParty} partyFieldId="field-consignee" addressFieldId="field-destination"
                    client={client} />
                  <StopDatesFields kind="delivery"
                    value={{ date: deliveryDate, dateEnd: deliveryDateEnd, firstAvailable: '' }}
                    onChange={setFirstDeliveryDates}
                    dateFieldId="field-deliveryDate" />
                </div>
                <ExtraStopsFields kind="delivery" value={extraDeliveries} onChange={setExtraDeliveries}
                  parties={parties} onPartyCreated={cacheParty} onRemove={removeStop('delivery')} client={client} />
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
          <NotesAndInstructionsFields value={notes} onChange={setNotes}
            clientAdded={order ? clientAddedInstructionsOf(order) : []}
            formatWhen={(at) => formatDateTime(at as unknown as { toDate: () => Date })} />
          </>)}

          {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600">{error}</div>}

          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="px-6 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <Link data-es href={backHref}
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
