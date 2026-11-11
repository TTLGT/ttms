'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useAuth } from '@/context/AuthContext';
import { createOrder } from '@/lib/orders';
import { listParties, tagPartyRole, recordPartyApproval } from '@/lib/parties';
import PartyCombobox from '@/components/parties/PartyCombobox';
import type { PartySelection } from '@/components/parties/PartyCombobox';
import CarrierCombobox from '@/components/carriers/CarrierCombobox';
import type { CarrierSelection } from '@/components/carriers/CarrierCombobox';
import DriverPicker from '@/components/carriers/DriverPicker';
import CarrierCompliance from '@/components/carriers/CarrierCompliance';
import type { DriverChoice } from '@/components/carriers/DriverPicker';
import { DEFAULT_RECORD_REGION } from '@/lib/phone';
import CommodityItemsFields from '@/components/orders/CommodityItemsFields';
import AccessorialsField from '@/components/orders/AccessorialsField';
import TransportTypeField from '@/components/orders/TransportTypeField';
import PriceAndTermsSection, { agreedRateFrom, blankPriceTerms, priceTermsForSave, priceTermsProblem, withDockArrangers } from '@/components/orders/PriceAndTermsSection';
import DockWorkFields, { BLANK_DOCK_WORK, dockWorkForSave } from '@/components/orders/DockWorkFields';
import type { DockWork } from '@/components/orders/DockWorkFields';
import type { PriceTerms } from '@/components/orders/PriceAndTermsSection';
import DimensionConverter from '@/components/orders/DimensionConverter';
import RouteMapLinkField from '@/components/orders/RouteMapLinkField';
import NotesAndInstructionsFields, { BLANK_NOTES_AND_INSTRUCTIONS, notesAndInstructionsForSave } from '@/components/orders/NotesAndInstructionsFields';
import type { NotesAndInstructions } from '@/components/orders/NotesAndInstructionsFields';
import RouteDistanceField from '@/components/orders/RouteDistanceField';
import type { LaneDistanceValue } from '@/components/orders/RouteDistanceField';
import { BLANK_ADDRESS } from '@/components/orders/AddressFields';
import StopPartyFields, { linkStopAddresses, stopLinkProblem } from '@/components/orders/StopPartyFields';
import { partyLocations } from '@/types/partyAddress';
import ExtraStopsFields, { afterRemoving, savedStopIndex, stopChoices, stopPartyIdsIn, stopsForSave, stopsProblem } from '@/components/orders/ExtraStopsFields';
import type { StopDraft } from '@/components/orders/ExtraStopsFields';
import { partyDisplayName, ROLE_LABEL } from '@/types/party';
import { blankCommodityItem, commoditySummary, dockLinkedServices, hasVehicleDetails, withDockServices, remapItemStops, totalPieces, totalWeightLb, totalCommodityValue } from '@/types/order';
import type { Accessorial, Address, CommodityItem, StopKind } from '@/types/order';
import type { Party, PartyRole } from '@/types/party';
import LeadSourceField from '@/components/orders/LeadSourceField';
import { dateRangeProblem } from '@/components/DateRangeField';
import StopDatesFields from '@/components/orders/StopDatesFields';
import type { StopDates } from '@/components/orders/StopDatesFields';
import PartyRolesGuide from '@/components/orders/PartyRolesGuide';
import LoadFactsFields, { loadFactsForSave, todayIso } from '@/components/orders/LoadFactsFields';
import type { LoadFacts } from '@/components/orders/LoadFactsFields';
import { Bi } from '@/components/spanish/Es';

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

function NewOrderForm() {
  const router        = useRouter();
  const searchParams  = useSearchParams();
  const { user }      = useAuth();

  const [parties, setParties]     = useState<Party[]>([]);
  const [client, setClient]       = useState<PartySelection>({ id: '', name: '' });
  const [shipper, setShipper]     = useState<PartySelection>({ id: '', name: '' });
  const [consignee, setConsignee] = useState<PartySelection>({ id: '', name: '' });
  const [carrier, setCarrier]     = useState<CarrierSelection>({ id: '', name: '' });
  const [driver, setDriver]       = useState<DriverChoice>({
    driverId: null, driverName: '', driverPhone: '',
    driverPhoneRegion: DEFAULT_RECORD_REGION, driverLicenseStoragePath: null,
  });
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  const [commodities, setCommodities]   = useState<CommodityItem[]>([blankCommodityItem()]);
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
  const [dockWork, setDockWork]         = useState<DockWork>(BLANK_DOCK_WORK);
  const [facts, setFacts] = useState<LoadFacts>({ loadType: '', quoteDate: '', clientBudget: '' });

  // Today, filled in once the page is in the browser: this page is
  // prerendered, and a date worked out at build time would be the build's.
  useEffect(() => {
    setFacts((f) => (f.quoteDate ? f : { ...f, quoteDate: todayIso() }));
  }, []);

  // The services and arrangers as saved, with what Loading and Unloading
  // needs added — see the same lines on the edit form.
  const dockSaved = dockWorkForSave(dockWork);
  const dockLinked = dockLinkedServices(dockSaved);
  const effAccessorials = withDockServices(accessorials, dockSaved);
  const priceTerms = withDockArrangers(rawPriceTerms, dockLinked);

  // Worked out, not typed (2026-11-04): carrier pay + broker fee + additional services.
  const agreedRate = agreedRateFrom(priceTerms, effAccessorials, brokerFee, carrierPay);

  // The legacy single-value fields stay on the order, derived from the items,
  // so lists, PDFs and agreement emails keep working unchanged.
  // Every stop in driving order, for the mileage and the map link.
  const tripStops = [
    origin, ...extraPickups.map((d) => d.address),
    destination, ...extraDeliveries.map((d) => d.address),
  ];

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
    listParties().then(setParties).catch(() => {});
  }, []);

  // Pre-select the party passed in the query string (e.g. "New order" from a
  // party page) once the list has loaded.
  useEffect(() => {
    for (const role of ['client', 'shipper', 'consignee'] as const) {
      const preId = searchParams.get(`${role}Id`);
      if (!preId || !parties.length) continue;
      const p = parties.find((x) => x.id === preId);
      if (!p) continue;
      const selection = { id: p.id, name: partyDisplayName(p) };
      if (role === 'client')    setClient(selection);
      // The party's first address for that role, as picking it by hand does.
      const first = partyLocations(p, role)[0]?.address;
      if (role === 'shipper')   { setShipper(selection);   if (first) setOrigin(first); }
      if (role === 'consignee') { setConsignee(selection); if (first) setDest(first); }
    }
  }, [parties, searchParams]);

  /** A driver belongs to one carrier, so changing the carrier drops the driver. */
  function handleCarrierPicked(selection: CarrierSelection) {
    setCarrier(selection);
    setDriver({
      driverId: null, driverName: '', driverPhone: '',
      driverPhoneRegion: DEFAULT_RECORD_REGION, driverLicenseStoragePath: null,
    });
  }

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
    if (!user) return;
    const unbound = unboundParties([
      ['client', client], ['shipper', shipper], ['consignee', consignee],
    ] as const);
    if (unbound.length) { setError(unboundMessage(unbound)); return; }
    // Same rule for the carrier, for the same reason: a name with no record
    // behind it has no email for the agreement and no insurance date to check.
    if (!carrier.id && carrier.name.trim()) {
      setError(`Carrier "${carrier.name.trim()}" is not on file yet. Pick one from the list, `
        + 'or add it with its details.');
      return;
    }
    const badRange = dateRangeProblem(extraPickups.length ? 'Pickup 1 date' : 'Pickup date', pickupDate, pickupDateEnd)
      || dateRangeProblem(extraDeliveries.length ? 'Delivery 1 date' : 'Delivery date', deliveryDate, deliveryDateEnd);
    if (badRange) { setError(badRange); return; }
    const badStop = stopLinkProblem('Pickup', 'shipper', { party: shipper, address: origin })
      || stopLinkProblem('Delivery', 'consignee', { party: consignee, address: destination })
      || stopsProblem('pickup', extraPickups) || stopsProblem('delivery', extraDeliveries);
    if (badStop) { setError(badStop); return; }
    const badCharge = priceTermsProblem(priceTerms, effAccessorials);
    if (badCharge) { setError(badCharge); return; }
    // The input is `required`, but a value of spaces gets past that.
    if (!transportType.trim()) { setError('Choose the transport type — the truck or trailer this load moves on.'); return; }

    setError('');
    setSaving(true);
    try {
      // Every pickup and delivery address belongs to its shipper or
      // consignee: one typed in here that the record does not have is added
      // to it first, and the order is not saved if that fails.
      setParties(await linkStopAddresses([
        { party: shipper, address: origin }, { party: consignee, address: destination },
        ...extraPickups, ...extraDeliveries,
      ], parties));

      // Every party on the load, extra stops included, in the role it plays.
      const partyRoles: [PartyRole, string][] = [
        ['client', client.id], ['shipper', shipper.id], ['consignee', consignee.id],
        ...stopPartyIdsIn(extraPickups).map((pid): [PartyRole, string] => ['shipper', pid]),
        ...stopPartyIdsIn(extraDeliveries).map((pid): [PartyRole, string] => ['consignee', pid]),
      ];
      // A party may be reused in a role it has never held before; record that
      // so role-filtered lists pick it up.
      await Promise.all(
        partyRoles
          .filter(([, pid]) => pid)
          // Best-effort: a party used under an approval is not writable by the
          // requester, and failing to tag a role must not block the order.
          .map(([role, pid]) => tagRoleIfNew(pid, role).catch(() => {})),
      );

      const clientParty = parties.find((p) => p.id === client.id);

      const id = await createOrder({
        clientId:      client.id,
        clientName:    client.name.trim(),
        shipperId:     shipper.id,
        shipperName:   shipper.name.trim(),
        consigneeId:   consignee.id,
        consigneeName: consignee.name.trim(),
        extraPickups:    stopsForSave(extraPickups),
        extraDeliveries: stopsForSave(extraDeliveries),
        parentOrderId: null,
        status:       'quote',
        commodity:    commoditySummary(commodityItems),
        commodities:  commodityItems,
        commodityValue: totalCommodityValue(commodityItems),
        pieces:       totalPieces(commodityItems) || 1,
        weight:       Math.round(totalWeightLb(commodityItems)),
        accessorials: effAccessorials,
        ...dockSaved,
        origin,
        destination,
        routeMapUrl:  routeMapUrl.trim(),
        laneMiles:       distance.laneMiles,
        laneMilesSource: distance.laneMilesSource,
        // When the mileage was worked out, which under Google Routes can be
        // long before this order existed — the lane comes from the cache.
        laneMilesAt:     distance.laneMilesAt as unknown as import('firebase/firestore').Timestamp | null,
        firstAvailablePickup: firstAvailable ? (new Date(firstAvailable) as unknown as import('firebase/firestore').Timestamp) : null,
        pickupDate:   pickupDate   ? (new Date(pickupDate)   as unknown as import('firebase/firestore').Timestamp) : null,
        deliveryDate: deliveryDate ? (new Date(deliveryDate) as unknown as import('firebase/firestore').Timestamp) : null,
        pickupDateEnd:   pickupDateEnd   ? (new Date(pickupDateEnd)   as unknown as import('firebase/firestore').Timestamp) : null,
        deliveryDateEnd: deliveryDateEnd ? (new Date(deliveryDateEnd) as unknown as import('firebase/firestore').Timestamp) : null,
        // Booking the truck at the same time as the load is normal here, so
        // the carrier can be set now. The status still starts at quote: a
        // carrier lined up is not the client agreeing to the rate.
        carrierId:    carrier.id || null,
        carrierName:  carrier.name.trim(),
        // Only ever set from a driver record here — the free-text driver
        // fields stay on the load screen, where the licence upload is.
        driverId:     driver.driverId,
        driverName:   driver.driverName,
        driverPhone:  driver.driverPhone,
        driverPhoneRegion: driver.driverPhoneRegion,
        driverLicenseStoragePath: driver.driverLicenseStoragePath,
        bolStoragePath: null,
        invoiceStoragePath: null,
        podStoragePath: null,
        agreedRate,
        brokerFee:    parseFloat(brokerFee)  || 0,
        carrierPay:   parseFloat(carrierPay) || 0,
        ...notesAndInstructionsForSave(notes),
        ...priceTermsForSave(priceTerms, effAccessorials),
        ...loadFactsForSave(facts),
        batsId:             null,
        vehicles:           '',
        transportType:      transportType.trim(),
        assignedTo:         '',
        // Whoever writes the order owns it. Orders are closed by default —
        // unlike a party, one with no owner is visible only to admin, dispatch
        // and finance — so a broker who did not put themselves on it would not
        // be able to open the order they had just created.
        assignedToUids:     [user.uid],
        assignedToGroupIds: [],
        assignedToEmails:   [],
        // The client's owners reach the order as a mirror, because rules
        // cannot query for them at read time. Kept in step afterwards by
        // syncClientOwners() whenever the client changes hands.
        clientOwnerUids:     clientParty?.assignedToUids     ?? [],
        clientOwnerGroupIds: clientParty?.assignedToGroupIds ?? [],
        sourceId,
        // BATS's raw text, and only ever written by the import. An order made
        // here picks a managed source or none at all.
        sourceName:         '',
        dispatchedAt:       null,
        pickedUpAt:         null,
        deliveredAt:        null,
        carrierSignedAt:    null,
        carrierSignerName:  null,
        carrierSignerIp:    null,
        shipperSignedAt:    null,
        shipperSignerName:  null,
        shipperSignerIp:    null,
        partyApprovals:     [],
        signatureWaivedAt:     null,
        signatureWaivedByUid:  null,
        signatureWaivedByName: null,
        signatureWaivedReason: null,
        signatureWaived:       false,
        createdBy:    user.uid,
      });
      // Stamp proof of authorization for any party the creator does not own.
      // Server-side, so the record cannot be fabricated by its beneficiary.
      await Promise.all(
        partyRoles
          .filter(([, pid]) => pid)
          .map(([role, pid]) => recordPartyApproval(id, pid, role).catch(() => {})),
      );

      router.push(`/dashboard/orders/${id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create order');
      setSaving(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
      <div className="mb-6">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700 mb-2 flex items-center gap-1">
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900"><Bi>New Order</Bi></h1>
        <p className="text-sm text-gray-500 mt-0.5"><Bi>Saved as a Quote — advance the status after creation.</Bi></p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* General */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 data-es className="text-sm font-semibold text-gray-900 uppercase tracking-wide">General</h2>
            <PartyRolesGuide />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Shipper and consignee sit in Route, each above the address
                  it fills — picking one prefills that address, so the two
                  belong side by side. The dates moved there too
                  (2026-11-11): each stop carries its own. */}
              <div className="col-span-1 sm:col-span-2 sm:max-w-md">
                <PartyCombobox
                  role="client"
                  label="Client (pays us and signs the SA)"
                  parties={parties}
                  value={client}
                  onChange={setClient}
                  onPartyCreated={cacheParty}
                  required
                />
              </div>
              <LoadFactsFields value={facts} onChange={setFacts} />
              {/* Whoever writes an order is put on it as an owner, so the
                  creator can always set the source on their own new load. */}
              <LeadSourceField value={sourceId} onChange={setSourceId} canEdit
                hint="Where this load came from. Used for attribution reporting." />
            </div>
          </section>

          {/* Freight */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div>
              <h2 data-es className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Freight</h2>
              <p className="text-xs text-gray-500 mt-1">
                <Bi>One line per commodity, each with its own value, weight and dimensions. Pieces, total value and
                weight are added up for you.</Bi>
              </p>
            </div>
            <TransportTypeField value={transportType} onChange={setTransportType} required />
            <CommodityItemsFields value={commodities} onChange={setCommodities}
              pickups={pickupChoices} deliveries={deliveryChoices} />
            <AccessorialsField value={effAccessorials} onChange={setAccessorials}
              locked={Object.keys(dockLinked) as Accessorial[]} />
          </section>

          <DockWorkFields value={dockWork} onChange={setDockWork}
            pickupState={origin.state} deliveryState={destination.state} />

          <PriceAndTermsSection
            brokerFee={brokerFee} onBrokerFee={setBrokerFee}
            carrierPay={carrierPay} onCarrierPay={setCarrierPay}
            laneMiles={distance.laneMiles}
            terms={priceTerms} onTerms={setPriceTerms}
            commodities={commodities}
            accessorials={effAccessorials}
            dockLinked={dockLinked}
          />

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
                    onPartyCreated={cacheParty} client={client} />
                  <StopDatesFields kind="pickup"
                    value={{ date: pickupDate, dateEnd: pickupDateEnd, firstAvailable }}
                    onChange={setFirstPickupDates} />
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
                    onPartyCreated={cacheParty} client={client} />
                  <StopDatesFields kind="delivery"
                    value={{ date: deliveryDate, dateEnd: deliveryDateEnd, firstAvailable: '' }}
                    onChange={setFirstDeliveryDates} />
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

          {/* Carrier */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div>
              <h2 data-es className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Carrier</h2>
              <p className="text-xs text-gray-500 mt-1">
                <Bi>Optional. Set it now if the truck is already lined up, or leave it and assign one
                from the load afterwards. Choosing a carrier lets you name the driver too; the
                licence upload and the dispatch sheet are handled on the load itself.</Bi>
              </p>
            </div>
            <div className="sm:max-w-md">
              <CarrierCombobox
                label="Carrier"
                value={carrier}
                onChange={handleCarrierPicked}
              />
            </div>
            {carrier.id && (
              <div className="sm:max-w-md">
                <CarrierCompliance key={carrier.id} carrierId={carrier.id} />
                <p className="text-xs text-gray-500 mt-2">
                  <Bi>Saved to the carrier, not this load — the certificate as soon as it uploads, the
                  rest with its own button. Every load with this carrier shows the same.</Bi>
                </p>
              </div>
            )}
            {carrier.id && (
              <div className="sm:max-w-md">
                <DriverPicker
                  carrierId={carrier.id}
                  value={driver.driverId}
                  onPick={setDriver}
                  hint="Optional. The driver's licence is uploaded on the load itself."
                />
              </div>
            )}
          </section>

          <NotesAndInstructionsFields value={notes} onChange={setNotes} />

          {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600">{error}</div>}

          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="px-6 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition">
              {saving ? 'Saving…' : 'Create Quote'}
            </button>
            <button type="button" onClick={() => router.back()}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition">
              Cancel
            </button>
          </div>
        </form>

        <DimensionConverter />
      </div>
    </div>
  );
}

export default function NewOrderPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <NewOrderForm />
    </Suspense>
  );
}
