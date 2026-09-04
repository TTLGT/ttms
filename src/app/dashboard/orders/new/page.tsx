'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useAuth } from '@/context/AuthContext';
import { createOrder } from '@/lib/orders';
import { listParties, tagPartyRole, recordPartyApproval } from '@/lib/parties';
import PartyCombobox from '@/components/parties/PartyCombobox';
import type { PartySelection } from '@/components/parties/PartyCombobox';
import CommodityItemsFields from '@/components/orders/CommodityItemsFields';
import DimensionConverter from '@/components/orders/DimensionConverter';
import RouteMapLinkField from '@/components/orders/RouteMapLinkField';
import RouteDistanceField from '@/components/orders/RouteDistanceField';
import type { LaneDistanceValue } from '@/components/orders/RouteDistanceField';
import { partyDisplayName, ROLE_LABEL } from '@/types/party';
import { blankCommodityItem, commoditySummary, totalPieces, totalWeightLb } from '@/types/order';
import type { Address, CommodityItem } from '@/types/order';
import type { Party, PartyRole } from '@/types/party';
import LeadSourceField from '@/components/orders/LeadSourceField';
import DateField from '@/components/DateField';

const BLANK_ADDRESS: Address = { street: '', city: '', state: '', zip: '', country: 'US' };

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];

function AddressFields({ label, value, onChange }: {
  label: string; value: Address; onChange: (a: Address) => void;
}) {
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...value, [k]: e.target.value });
  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 mb-3">{label}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="col-span-1 sm:col-span-2">
          <input placeholder="Street address" value={value.street} onChange={set('street')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>
        <input placeholder="City" value={value.city} onChange={set('city')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
        <select value={value.state} onChange={set('state')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400">
          <option value="">State</option>
          {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input placeholder="ZIP" value={value.zip} onChange={set('zip')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
      </div>
    </div>
  );
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

function NewOrderForm() {
  const router        = useRouter();
  const searchParams  = useSearchParams();
  const { user }      = useAuth();

  const [parties, setParties]     = useState<Party[]>([]);
  const [client, setClient]       = useState<PartySelection>({ id: '', name: '' });
  const [shipper, setShipper]     = useState<PartySelection>({ id: '', name: '' });
  const [consignee, setConsignee] = useState<PartySelection>({ id: '', name: '' });
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  const [commodities, setCommodities]   = useState<CommodityItem[]>([blankCommodityItem()]);
  const [origin, setOrigin]             = useState<Address>(BLANK_ADDRESS);
  const [destination, setDest]          = useState<Address>(BLANK_ADDRESS);
  const [routeMapUrl, setRouteMapUrl]   = useState('');
  const [distance, setDistance]         = useState<LaneDistanceValue>({ laneMiles: null, laneMilesSource: null, laneMilesAt: null });
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [firstAvailable, setFirstAvailable] = useState('');
  const [pickupDate, setPickupDate]     = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [agreedRate, setAgreedRate]     = useState('');
  const [brokerFee, setBrokerFee]       = useState('');
  const [notes, setNotes]               = useState('');

  const carrierPay = (parseFloat(agreedRate) || 0) - (parseFloat(brokerFee) || 0);

  // The legacy single-value fields stay on the order, derived from the items,
  // so lists, PDFs and agreement emails keep working unchanged.
  const commodityItems = commodities.filter((c) => c.description.trim() || c.weight || c.length || c.width || c.height);

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
      if (role === 'shipper')   { setShipper(selection);   if (p.defaultOrigin) setOrigin(p.defaultOrigin); }
      if (role === 'consignee') { setConsignee(selection); if (p.defaultDest)   setDest(p.defaultDest); }
    }
  }, [parties, searchParams]);

  function cacheParty(p: Party) {
    setParties((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
  }

  /** Prefills the origin address from a shipper's saved default pickup location. */
  function handleShipperPicked(selection: PartySelection, party: Party | null) {
    setShipper(selection);
    if (party?.defaultOrigin) setOrigin(party.defaultOrigin);
  }

  function handleConsigneePicked(selection: PartySelection, party: Party | null) {
    setConsignee(selection);
    if (party?.defaultDest) setDest(party.defaultDest);
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

    setError('');
    setSaving(true);
    try {
      // A party may be reused in a role it has never held before; record that
      // so role-filtered lists pick it up.
      await Promise.all(
        ([['client', client], ['shipper', shipper], ['consignee', consignee]] as const)
          .filter(([, sel]) => sel.id)
          // Best-effort: a party used under an approval is not writable by the
          // requester, and failing to tag a role must not block the order.
          .map(([role, sel]) => tagRoleIfNew(sel.id, role).catch(() => {})),
      );

      const clientParty = parties.find((p) => p.id === client.id);

      const id = await createOrder({
        clientId:      client.id,
        clientName:    client.name.trim(),
        shipperId:     shipper.id,
        shipperName:   shipper.name.trim(),
        consigneeId:   consignee.id,
        consigneeName: consignee.name.trim(),
        parentOrderId: null,
        status:       'quote',
        commodity:    commoditySummary(commodityItems),
        commodities:  commodityItems,
        pieces:       totalPieces(commodityItems) || 1,
        weight:       Math.round(totalWeightLb(commodityItems)),
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
        carrierId:    null,
        carrierName:  '',
        driverName:   '',
        driverPhone:  '',
        driverLicenseStoragePath: null,
        bolStoragePath: null,
        invoiceStoragePath: null,
        podStoragePath: null,
        agreedRate:   parseFloat(agreedRate) || 0,
        brokerFee:    parseFloat(brokerFee)  || 0,
        carrierPay,
        notes:        notes.trim(),
        batsId:             null,
        vehicles:           '',
        transportType:      '',
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
        ([['client', client], ['shipper', shipper], ['consignee', consignee]] as const)
          .filter(([, sel]) => sel.id)
          .map(([role, sel]) => recordPartyApproval(id, sel.id, role).catch(() => {})),
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
        <h1 className="text-2xl font-bold text-gray-900">New Order</h1>
        <p className="text-sm text-gray-500 mt-0.5">Saved as a Quote — advance the status after creation.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Shipment Info */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Shipment Info</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <PartyCombobox
                  role="client"
                  label="Client (signs the contract)"
                  parties={parties}
                  value={client}
                  onChange={setClient}
                  onPartyCreated={cacheParty}
                  required
                />
                <PartyCombobox
                  role="shipper"
                  label="Shipper (pickup)"
                  parties={parties}
                  value={shipper}
                  onChange={handleShipperPicked}
                  onPartyCreated={cacheParty}
                />
                <PartyCombobox
                  role="consignee"
                  label="Consignee (delivery)"
                  parties={parties}
                  value={consignee}
                  onChange={handleConsigneePicked}
                  onPartyCreated={cacheParty}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">First Available Pickup</label>
                <DateField value={firstAvailable} onChange={setFirstAvailable}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                <p className="text-xs text-gray-500 mt-1">Earliest the client says the freight can be collected.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Pickup Date</label>
                <DateField value={pickupDate} onChange={setPickupDate}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Delivery Date</label>
                <DateField value={deliveryDate} onChange={setDeliveryDate}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
              </div>
              {/* Whoever writes an order is put on it as an owner, so the
                  creator can always set the source on their own new load. */}
              <LeadSourceField value={sourceId} onChange={setSourceId} canEdit
                hint="Where this load came from. Used for attribution reporting." />
            </div>
          </section>

          {/* Freight */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Freight</h2>
              <p className="text-xs text-gray-500 mt-1">
                One line per commodity, each with its own weight and dimensions. Pieces and total
                weight are added up for you.
              </p>
            </div>
            <CommodityItemsFields value={commodities} onChange={setCommodities} />
          </section>

          {/* Route */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Route</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <AddressFields label="Origin" value={origin} onChange={setOrigin} />
              <AddressFields label="Destination" value={destination} onChange={setDest} />
            </div>
            <RouteDistanceField
              origin={origin}
              destination={destination}
              value={distance}
              onChange={setDistance}
            />
            <RouteMapLinkField
              origin={origin}
              destination={destination}
              value={routeMapUrl}
              onChange={setRouteMapUrl}
            />
          </section>

          {/* Financials */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Financials</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Agreed Rate (USD)</label>
                <input type="number" min="0" step="0.01" value={agreedRate} onChange={(e) => setAgreedRate(e.target.value)} placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Broker Fee (USD)</label>
                <input type="number" min="0" step="0.01" value={brokerFee} onChange={(e) => setBrokerFee(e.target.value)} placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Carrier Pay (auto)</label>
                <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700">
                  {carrierPay > 0
                    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(carrierPay)
                    : '—'}
                </div>
              </div>
            </div>
          </section>

          {/* Notes */}
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Notes</h2>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder="Any special instructions or details…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none" />
          </section>

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
