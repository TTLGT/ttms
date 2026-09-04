'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { ExternalLink, Map, Plus, RefreshCw, Route } from 'lucide-react';
import Link from 'next/link';
import {
  announceOrderEvent, getOrder, orderDocumentUrl, requestOrderAccess, updateOrderStatus, updateOrder,
  listOrdersPage, createOrder,
} from '@/lib/orders';
import NoAccessPanel from '@/components/access/NoAccessPanel';
import CopyLinkButton from '@/components/CopyLinkButton';
import DiscussButton from '@/components/chat/DiscussButton';
import { listCarriers } from '@/lib/carriers';
import type { Order, OrderStatus } from '@/types/order';
import type { Carrier } from '@/types/carrier';
import {
  STATUS_LABEL,
  STATUS_NEXT,
  clientSignatureSatisfied,
  formatDimensions,
  itemWeightLb,
  orderCommodityItems,
  buildRouteMapUrl,
  formatLaneMiles,
  isRoutableAddress,
  laneMilesAtNote,
  laneMilesCaption,
  laneMilesLabel,
  orderDisplayNumber,
  orderAltNumber,
} from '@/types/order';
import { fetchLaneDistance } from '@/lib/routeDistanceClient';
import { toDate } from '@/lib/dateFormat';
import type { Timestamp } from 'firebase/firestore';
import StatusBadge from '@/components/orders/StatusBadge';
import DriverLicenseUpload from '@/components/orders/DriverLicenseUpload';
import QuickAddCarrierModal from '@/components/carriers/QuickAddCarrierModal';
import PersonNameFields from '@/components/PersonNameFields';
import DocumentUpload, { DownloadLink } from '@/components/orders/DocumentUpload';
import { useAuth } from '@/context/AuthContext';
import { leadSourceLabel, listLeadSources } from '@/lib/leadSources';
import type { LeadSource } from '@/types/leadSource';
import type { OwnerContact } from '@/types/order';
import { useDateFormatters } from '@/lib/useDateFormatters';

// Sentinel value for the dropdown's "add a new carrier" row. Not a document id,
// so it can never collide with a real carrier.
const NEW_CARRIER = '__new__';

const PIPELINE: OrderStatus[] = [
  'quote', 'booked', 'carrier_assigned', 'shipper_signed',
  'carrier_signed', 'in_transit', 'delivered', 'completed',
];

/**
 * Label for the parent-order link.
 *
 * An imported order's document id is `bats-<BATS Id>` and its order number is
 * that same BATS Id, so stripping the prefix gives the number a broker will
 * actually recognise from BATS. Anything else is a Firestore auto-id with no
 * meaning to a reader, so it stays truncated as before.
 */
function parentLabel(parentOrderId: string): string {
  return parentOrderId.startsWith('bats-')
    ? parentOrderId.slice(5)
    : `${parentOrderId.slice(0, 8)}…`;
}

/**
 * The distance API's `calculatedAt` as the order stores it.
 *
 * A Date is what the client SDK turns into a timestamp on write, and what the
 * date formatters read on the way back out, so the value goes in unconverted
 * and the cast is only for the field's declared type.
 */
function laneMilesStamp(iso: string | null | undefined): Timestamp | null {
  return iso ? (new Date(iso) as unknown as Timestamp) : null;
}

function formatCurrency(n: number | undefined): string {
  if (n === undefined || n === null || n === 0) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

interface DriverDetails {
  driverName: string;
  driverPhone: string;
  driverLicenseStoragePath: string | null;
  /** Order the details came from, so the UI can say where they came from. */
  sourceOrderNumber: string;
}

/**
 * Driver details from the most recent other order run with this carrier.
 *
 * There is no drivers collection — a driver only exists as three fields on an
 * order — so "the driver we used last time" has to be read back out of order
 * history. The page arrives sorted by createdAt desc, so the first hit is the
 * most recent one.
 *
 * Asks for that carrier's recent loads rather than scanning every order in the
 * company — this used to read the whole collection, which is ten thousand
 * documents to answer a question about one carrier. Twenty is enough: a carrier
 * whose last twenty loads all went out with no driver recorded has nothing to
 * prefill from anyway.
 */
async function lastDriverForCarrier(
  carrierId: string,
  excludeOrderId: string
): Promise<DriverDetails | null> {
  const { orders } = await listOrdersPage({ carrierId, limit: 20 }).catch(() => ({ orders: [] as Order[] }));
  const prev = orders.find(
    (o) => o.id !== excludeOrderId && !!o.driverName?.trim()
  );
  if (!prev) return null;
  return {
    driverName:  prev.driverName ?? '',
    driverPhone: prev.driverPhone ?? '',
    driverLicenseStoragePath: prev.driverLicenseStoragePath ?? null,
    sourceOrderNumber: orderDisplayNumber(prev),
  };
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-gray-900">{value || '—'}</p>
    </div>
  );
}

export default function OrderDetailPage() {
  // Dates are written the way the company setting says — see Settings →
  // Operations → Date Format.
  const { formatDate, formatDateTime } = useDateFormatters();
  const params   = useParams();
  const orderId  = params.orderId as string;
  const router   = useRouter();
  const { user, isAdmin, can } = useAuth();

  const [refreshingMiles, setRefreshingMiles] = useState(false);
  const [milesNote, setMilesNote]             = useState('');
  // Set when the backfill below finds this order has no mileage and working
  // one out would be billed. The number then waits for a click instead.
  const [milesNeedLookup, setMilesNeedLookup] = useState(false);

  const [order, setOrder]           = useState<Order | null>(null);
  // Why the order could not be opened, when it could not. Kept apart from
  // `order` being null so the page can name the owner instead of claiming the
  // load does not exist — see NoAccessPanel.
  const [noAccess, setNoAccess]     = useState<{
    status: 'missing' | 'denied';
    ownerName: string;
    orderNumber: string;
    owner: OwnerContact | null;
  } | null>(null);
  // Loaded so the order can show its source's current name. Only the id is
  // stored on the order, so a source an admin renames reads correctly here
  // without any order being rewritten.
  const [leadSources, setLeadSources] = useState<LeadSource[]>([]);
  const [suborders, setSuborders]   = useState<Order[]>([]);
  const [carriers, setCarriers]     = useState<Carrier[]>([]);
  const [loading, setLoading]       = useState(true);
  const [advancing, setAdvancing]   = useState(false);
  const [splitting, setSplitting]   = useState(false);
  const [error, setError]           = useState('');
  /*
    The tab comes from the URL when one was named. The Documents screen has
    always linked here with ?tab=documents and this page has always ignored it,
    so following a document landed on Details and left the reader to find the
    file again. Same reason `from` is read below.
  */
  const searchParams = useSearchParams();
  const askedTab     = searchParams.get('tab');
  const [tab, setTab] = useState<'details' | 'documents' | 'suborders'>(
    askedTab === 'documents' || askedTab === 'suborders' ? askedTab : 'details',
  );

  /*
    Where "back" goes. Orders is right for somebody who came from the orders
    list, and wrong for somebody who followed a driver's licence off the
    Documents screen: licences are listed company-wide, so they may well have
    arrived from a load that is not theirs, and the orders list does not contain
    it. Sending them there offers a list they cannot find their way back from.
  */
  const back = searchParams.get('from') === 'documents'
    ? { href: '/dashboard/documents', label: 'Back to Documents' }
    : { href: '/dashboard/orders',    label: 'Back to Orders' };

  // carrier assignment state
  const [assigningCarrier, setAssigningCarrier] = useState(false);
  const [selectedCarrierId, setSelectedCarrierId] = useState('');
  const [driverName, setDriverName]   = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [driverLicensePath, setDriverLicensePath] = useState<string | null>(null);
  const [savingCarrier, setSavingCarrier] = useState(false);
  const [addingCarrier, setAddingCarrier] = useState(false);
  // What the last carrier selection auto-filled, so a later selection can
  // replace its own guess without overwriting anything the user typed.
  const [prefill, setPrefill] = useState<DriverDetails | null>(null);
  const [prefillSource, setPrefillSource] = useState('');
  // Stamps each prefill lookup so a slow one for a carrier the user has since
  // changed away from cannot overwrite a newer answer.
  const prefillRequest = useRef(0);

  // carrier e-sign state
  const [sendingAgreement, setSendingAgreement] = useState(false);
  const [agreementSentTo, setAgreementSentTo]   = useState('');

  // shipper e-sign state
  const [sendingShipperAgreement, setSendingShipperAgreement] = useState(false);
  const [shipperAgreementSentTo, setShipperAgreementSentTo]   = useState('');

  // Dispatching without the client's signature. The reason box is open by
  // default rather than a confirm dialog: this is a decision somebody will be
  // asked about later, and typing why is the cheapest moment to record it.
  const [showWaive, setShowWaive]     = useState(false);
  const [waiveReason, setWaiveReason] = useState('');
  const [waiving, setWaiving]         = useState(false);

  // BOL state
  const [generatingBol, setGeneratingBol] = useState(false);
  const [bolUrl, setBolUrl]               = useState<string | null>(null);

  // invoice state
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [invoiceUrl, setInvoiceUrl]               = useState<string | null>(null);
  const [invoicePath, setInvoicePath]             = useState<string | null>(null);

  // POD state
  const [podPath, setPodPath] = useState<string | null>(null);

  // Stops the backfill below from re-running and re-writing on every render
  // that produces a new `order` object.
  const backfilledRef = useRef<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [access, cs, subs, srcs] = await Promise.all([
          getOrder(orderId),
          listCarriers(),
          // Just this order's suborders. Fetching every order in the company
          // and filtering to the two or three underneath this one cost about
          // seventeen seconds on a collection this size.
          listOrdersPage({ parentOrderId: orderId }),
          listLeadSources(),
        ]);
        const o = access.status === 'ok' ? access.order : null;
        setNoAccess(
          access.status === 'ok'
            ? null
            : {
                status:      access.status,
                ownerName:   access.status === 'denied' ? access.ownerName   : '',
                orderNumber: access.status === 'denied' ? access.orderNumber : '',
                owner:       access.status === 'denied' ? access.owner       : null,
              },
        );
        setOrder(o);
        setLeadSources(srcs);
        setCarriers(cs.filter((c) => c.isActive));
        if (o) {
          setSuborders(subs.orders);
          setInvoicePath(o.invoiceStoragePath ?? null);
          setPodPath(o.podStoragePath ?? null);
        }
        // Both links come from /api/orders/{id}/document, which re-checks who
        // may see this order before signing a URL. The generation routes hand
        // back a URL of their own, but only to the finance and admin accounts
        // allowed to press the button.
        if (o?.bolStoragePath && user) {
          orderDocumentUrl(orderId, 'bol')
            .then((u) => { if (u) setBolUrl(u); })
            .catch(() => {});
        }
        if (o?.invoiceStoragePath && user) {
          orderDocumentUrl(orderId, 'invoice')
            .then((u) => { if (u) setInvoiceUrl(u); })
            .catch(() => {});
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load order');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [orderId, user]);

  /**
   * Fill in the distance for an order that has none — one created before this
   * feature, or whose addresses were completed after it was saved. Written
   * back so the number stays fixed to what the broker saw, rather than moving
   * if the estimate is retuned or the method is switched later.
   *
   * Runs once per order, and never bills: under Google Routes it is answered
   * only if the lane is already in the cache, and otherwise puts the button
   * below on screen rather than spending money on somebody merely opening a
   * load. See /api/route-distance.
   */
  useEffect(() => {
    if (!order || order.laneMiles !== null && order.laneMiles !== undefined) return;
    if (!isRoutableAddress(order.origin) || !isRoutableAddress(order.destination)) return;
    if (backfilledRef.current === order.id) return;
    backfilledRef.current = order.id;

    let cancelled = false;
    (async () => {
      const result = await fetchLaneDistance(order.origin, order.destination);
      if (cancelled) return;
      if (result.status === 'needs_lookup') { setMilesNeedLookup(true); return; }
      if (result.status !== 'ok') return;
      const patch = {
        laneMiles: result.miles,
        laneMilesSource: result.source,
        laneMilesAt: laneMilesStamp(result.calculatedAt),
      };
      setOrder((prev) => (prev ? { ...prev, ...patch } : prev));
      // Best-effort: showing the distance matters more than storing it, and a
      // failed write just means the next viewer works it out again.
      updateOrder(order.id, patch).catch(() => {});
    })();
    return () => { cancelled = true; };
  }, [order]);

  /**
   * Work out the mileage for an order that has none, on request.
   *
   * Only reachable under Google Routes, and only for a lane nobody has looked
   * up before — anything cheaper the backfill above has already filled in. Not
   * admin-only, unlike the recheck below: this fills a blank rather than
   * replacing a number, and until the button existed simply opening the load
   * did it unasked. The cost is said out loud beside the button instead.
   */
  async function handleLookUpMiles() {
    if (!order) return;

    setRefreshingMiles(true);
    setMilesNote('');
    const result = await fetchLaneDistance(order.origin, order.destination, true);
    setRefreshingMiles(false);

    if (result.status !== 'ok') {
      setMilesNote(
        result.status === 'error' ? result.message : 'Could not work out a distance for this lane.',
      );
      return;
    }

    setMilesNeedLookup(false);
    const patch = {
      laneMiles: result.miles,
      laneMilesSource: result.source,
      laneMilesAt: laneMilesStamp(result.calculatedAt),
    };
    setOrder((prev) => (prev ? { ...prev, ...patch } : prev));
    // Best-effort, as in the backfill: the number on screen matters more than
    // the write, and the lane is in Google's cache now either way.
    updateOrder(order.id, patch).catch(() => {});
  }

  /**
   * Ask Google for this lane again, overwriting what was stored.
   *
   * Admin only and never automatic: a stored mileage is normally permanent, so
   * this is the deliberate way to correct one somebody believes has gone stale.
   * It bills a lookup, hence the confirm. Only this order is updated — other
   * orders already on this lane keep the number they were quoted on, which is
   * the point of storing it per order in the first place.
   */
  async function handleRefreshMiles() {
    if (!order || !user) return;

    const ok = window.confirm(
      'Ask Google for this lane again?\n\n'
      + 'This charges for one lookup and replaces the mileage stored for this '
      + 'order. Other orders on the same lane keep their current mileage.',
    );
    if (!ok) return;

    setRefreshingMiles(true);
    setMilesNote('');
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/route-distance/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          origin: order.origin,
          destination: order.destination,
          orderId: order.id,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Refresh failed');

      const patch = {
        laneMiles: body.miles as number,
        laneMilesSource: 'routes' as const,
        // Moves with the number: the point of a recheck is that the figure is
        // as of now, and a date left behind would say the opposite.
        laneMilesAt: laneMilesStamp(body.calculatedAt as string | null),
      };
      setOrder((prev) => (prev ? { ...prev, ...patch } : prev));
      await updateOrder(order.id, patch);

      setMilesNote(
        body.previousMiles === null || body.previousMiles === body.miles
          ? 'Rechecked — unchanged.'
          : `Updated from ${body.previousMiles} mi.`,
      );
    } catch (e: unknown) {
      setMilesNote(e instanceof Error ? e.message : 'Refresh failed');
    } finally {
      setRefreshingMiles(false);
    }
  }

  function openCarrierAssign() {
    setSelectedCarrierId(order?.carrierId ?? '');
    setDriverName(order?.driverName ?? '');
    setDriverPhone(order?.driverPhone ?? '');
    setDriverLicensePath(order?.driverLicenseStoragePath ?? null);
    setPrefill(null);
    setPrefillSource('');
    setAssigningCarrier(true);
  }

  function handleCarrierSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    if (e.target.value === NEW_CARRIER) {
      // Leave the select on its previous value — the new carrier is only
      // selected once it actually saves, so cancelling changes nothing.
      setAddingCarrier(true);
      return;
    }
    const carrierId = e.target.value;
    setSelectedCarrierId(carrierId);
    if (!carrierId) {
      applyDriverPrefill(null);
      return;
    }
    // The lookup is a round trip now, so a fast second change must not be
    // overwritten by a slow first one landing late.
    const mine = ++prefillRequest.current;
    void lastDriverForCarrier(carrierId, orderId).then((found) => {
      if (mine === prefillRequest.current) applyDriverPrefill(found);
    });
  }

  /**
   * Fill the driver fields from the carrier's last load.
   *
   * Only fields that are empty, or that still hold the previous selection's
   * guess, are touched — anything the user typed themselves survives a change
   * of carrier.
   */
  function applyDriverPrefill(next: DriverDetails | null) {
    const isOursOrEmpty = (value: string, previous: string | undefined) =>
      value.trim() === '' || (previous !== undefined && value === previous);

    if (isOursOrEmpty(driverName, prefill?.driverName)) {
      setDriverName(next?.driverName ?? '');
    }
    if (isOursOrEmpty(driverPhone, prefill?.driverPhone)) {
      setDriverPhone(next?.driverPhone ?? '');
    }
    if (driverLicensePath === null || driverLicensePath === prefill?.driverLicenseStoragePath) {
      setDriverLicensePath(next?.driverLicenseStoragePath ?? null);
    }

    setPrefill(next);
    setPrefillSource(next?.sourceOrderNumber ?? '');
  }

  function handleCarrierCreated(carrier: Carrier) {
    setCarriers((prev) =>
      [...prev, carrier].sort((a, b) => a.companyName.localeCompare(b.companyName))
    );
    setSelectedCarrierId(carrier.id);
    // A carrier created just now has no past loads to inherit a driver from.
    applyDriverPrefill(null);
    setAddingCarrier(false);
  }

  async function handleSaveCarrier() {
    if (!order) return;
    setSavingCarrier(true);
    setError('');
    try {
      const carrier = carriers.find((c) => c.id === selectedCarrierId);
      await updateOrder(orderId, {
        carrierId:   selectedCarrierId || null,
        carrierName: carrier?.companyName ?? '',
        driverName:  driverName.trim(),
        driverPhone: driverPhone.trim(),
        driverLicenseStoragePath: driverLicensePath,
      });
      setOrder({
        ...order,
        carrierId:   selectedCarrierId || null,
        carrierName: carrier?.companyName ?? '',
        driverName:  driverName.trim(),
        driverPhone: driverPhone.trim(),
        driverLicenseStoragePath: driverLicensePath,
      });
      setAssigningCarrier(false);
      // The carrier is the single most asked-about fact on a load, so it is
      // the one worth the room hearing without anybody having to say it.
      void announceOrderEvent(orderId, 'carrier');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to assign carrier');
    } finally {
      setSavingCarrier(false);
    }
  }

  async function handleSendAgreement() {
    if (!order || !user) return;
    setSendingAgreement(true);
    setError('');
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/orders/${orderId}/send-agreement`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to send');
      setAgreementSentTo(body.sentTo ?? 'carrier');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send agreement');
    } finally {
      setSendingAgreement(false);
    }
  }

  async function handleSendShipperAgreement() {
    if (!order || !user) return;
    setSendingShipperAgreement(true);
    setError('');
    try {
      const idToken = await user.getIdToken();
      const res  = await fetch(`/api/orders/${orderId}/send-shipper-agreement`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to send');
      setShipperAgreementSentTo(body.sentTo ?? 'shipper');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send shipper agreement');
    } finally {
      setSendingShipperAgreement(false);
    }
  }

  async function handleWaiveSignature() {
    if (!order || !user) return;
    setWaiving(true);
    setError('');
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/orders/${orderId}/waive-signature`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ reason: waiveReason.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to dispatch without a signature');
      // Written into local state as a truthy stand-in for the server's
      // timestamp. Only `clientSignatureSatisfied()` reads it here, and it asks
      // whether there is one — the order is refetched on the next visit.
      setOrder({
        ...order,
        signatureWaivedAt:     body.signatureWaivedAt as unknown as Timestamp,
        signatureWaivedByName: body.signatureWaivedByName ?? null,
        signatureWaivedReason: body.signatureWaivedReason ?? null,
        signatureWaived:       true,
      });
      setShowWaive(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to dispatch without a signature');
    } finally {
      setWaiving(false);
    }
  }

  async function handleGenerateBol() {
    if (!order || !user) return;
    setGeneratingBol(true);
    setError('');
    try {
      const idToken = await user.getIdToken();
      const res  = await fetch(`/api/orders/${orderId}/bol`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to generate BOL');
      setBolUrl(body.url);
      setOrder({ ...order, bolStoragePath: body.path });
      window.open(body.url, '_blank');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to generate BOL');
    } finally {
      setGeneratingBol(false);
    }
  }

  async function handleGenerateInvoice() {
    if (!order || !user) return;
    setGeneratingInvoice(true);
    setError('');
    try {
      const idToken = await user.getIdToken();
      const res  = await fetch(`/api/orders/${orderId}/invoice`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to generate invoice');
      setInvoiceUrl(body.url);
      setInvoicePath(body.path);
      setOrder({ ...order, invoiceStoragePath: body.path });
      window.open(body.url, '_blank');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to generate invoice');
    } finally {
      setGeneratingInvoice(false);
    }
  }

  async function handlePodUploaded(path: string | null) {
    // Saved before the View link appears. The link asks the server for the
    // file by order id, so it has nothing to resolve until the path is on the
    // order — showing it any earlier would offer a download that 404s.
    await updateOrder(orderId, { podStoragePath: path }).catch(() => {});
    setPodPath(path);
    if (order) setOrder({ ...order, podStoragePath: path });
    void announceOrderEvent(orderId, 'pod');
  }

  async function handleAdvance() {
    if (!order) return;
    const next = STATUS_NEXT[order.status];
    if (!next) return;
    setAdvancing(true);
    try {
      await updateOrderStatus(orderId, next);
      setOrder({ ...order, status: next });
      // After the write, never before it, and never awaited into the same
      // try: the status is what matters and the announcement is a courtesy.
      void announceOrderEvent(orderId, 'status');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update status');
    } finally {
      setAdvancing(false);
    }
  }

  async function handleCreateSuborder() {
    if (!order || !user) return;
    setSplitting(true);
    try {
      const id = await createOrder({
        clientId:      order.clientId ?? '',
        clientName:    order.clientName ?? '',
        shipperId:     order.shipperId ?? '',
        shipperName:   order.shipperName ?? '',
        consigneeId:   order.consigneeId ?? '',
        consigneeName: order.consigneeName ?? '',
        parentOrderId: orderId,
        status:       'quote',
        commodity:    order.commodity,
        // A suborder is a split of the parent's freight — which pieces go on it
        // is exactly what the broker is about to decide, so it starts empty
        // rather than duplicating the whole load.
        commodities:  [],
        pieces:       1,
        weight:       0,
        origin:       order.origin,
        destination:  order.destination,
        routeMapUrl:  order.routeMapUrl ?? '',
        // Same origin and destination as the parent, so the same lane — and
        // under Google Routes, no reason to buy the identical lookup twice.
        laneMiles:       order.laneMiles ?? null,
        laneMilesSource: order.laneMilesSource ?? null,
        // The same number, so the same date it was worked out — not today.
        // Through toDate() because the parent came over the API, where a
        // timestamp arrives as `{_seconds}` and would save back as a map.
        laneMilesAt:     toDate(order.laneMilesAt) as unknown as Timestamp | null,
        // The client's earliest-pickup constraint applies to the whole load, so
        // it carries onto a split. The scheduled dates do not — those are for
        // dispatch to set per suborder.
        firstAvailablePickup: order.firstAvailablePickup ?? null,
        pickupDate:   null,
        deliveryDate: null,
        carrierId:    null,
        carrierName:  '',
        driverName:   '',
        driverPhone:  '',
        driverLicenseStoragePath: null,
        bolStoragePath: null,
        invoiceStoragePath: null,
        podStoragePath: null,
        agreedRate:   0,
        brokerFee:    0,
        carrierPay:   0,
        notes:        '',
        batsId:             null,
        vehicles:           order.vehicles || '',
        transportType:      order.transportType || '',
        assignedTo:         '',
        // A suborder is part of the same load, so it inherits the parent's
        // owners rather than starting closed. The splitter is added too — they
        // may be dispatch acting on someone else's order, and would otherwise
        // lose sight of the suborder the moment they created it.
        assignedToUids:     [...new Set([...(order.assignedToUids ?? []), user.uid])],
        assignedToGroupIds: order.assignedToGroupIds ?? [],
        assignedToEmails:   order.assignedToEmails ?? [],
        // Same client as the parent, so the same mirrored client owners.
        clientOwnerUids:     order.clientOwnerUids     ?? [],
        clientOwnerGroupIds: order.clientOwnerGroupIds ?? [],
        // A split came from wherever the parent load came from, so it inherits
        // the attribution rather than starting unattributed.
        sourceId:           order.sourceId ?? null,
        sourceName:         order.sourceName ?? '',
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
      router.push(`/dashboard/orders/${id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create suborder');
      setSplitting(false);
    }
  }

  /*
   * Where the two agreements stand, as the cards ask it.
   *
   * Both are written against the signature fields rather than the status,
   * because the status is one value and the two signatures now come back in
   * whichever order the load takes — a waived load can have its carrier sign
   * days before the client does, and reading `status === 'carrier_signed'`
   * would hide a card the moment the other signature landed.
   */
  const clientConfirmationStarted =
    !!order && !['quote', 'cancelled'].includes(order.status);
  const awaitingCarrierSignature =
    !!order && !['quote', 'booked', 'cancelled'].includes(order.status) && !order.carrierSignedAt;

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!order) return (
    <NoAccessPanel
      kind="order"
      status={noAccess?.status ?? 'missing'}
      ownerName={noAccess?.ownerName}
      recordNumber={noAccess?.orderNumber}
      owner={noAccess?.owner}
      // Where they came from, not where orders live. Somebody who followed a
      // driver's licence off the Documents screen has no business being sent
      // to a list of loads they mostly cannot open — see cameFrom.
      backHref={back.href}
      backLabel={back.label}
      // Only offered on a denial: there is nobody to ask about a load that has
      // been deleted.
      onRequest={
        noAccess?.status === 'denied'
          ? async (reason) => { await requestOrderAccess(orderId, reason); }
          : undefined
      }
      grantNote="If approved, you will be able to open this load for as long as the owner allows. It does not make you an owner of it."
    />
  );

  const nextStatus  = STATUS_NEXT[order.status];
  const currentStep = PIPELINE.indexOf(order.status);
  const milesAtNote = laneMilesAtNote(order.laneMilesSource, formatDateTime(order.laneMilesAt, ''));


  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
      <Link href="/dashboard/orders" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
        ← Orders
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900 font-mono">{orderDisplayNumber(order)}</h1>
            <StatusBadge status={order.status} />
            {order.parentOrderId && (
              <Link href={`/dashboard/orders/${order.parentOrderId}`} className="text-xs text-gray-400 hover:text-brand-600">
                Suborder of {parentLabel(order.parentOrderId)}
              </Link>
            )}
          </div>
          <p className="text-sm text-gray-500">{order.clientName || order.shipperName} — {order.commodity}</p>
          {/* The load's other number, under the one it is known by. A BATS
              load leads with its BATS id and carries its TTMS number here; a
              TTMS load that predates the sequence carries the random number it
              used to have. See orderDisplayNumber(). */}
          {orderAltNumber(order) && (
            <p className="text-xs text-gray-400 mt-1 font-mono">
              {order.batsId ? 'TTMS ' : 'previously '}{orderAltNumber(order)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Beside the link button, not buried in a tab: the conversation
              about a load is part of the load's record, and the whole point of
              it living here is that nobody has to remember which room it was
              in. See DiscussButton. */}
          <DiscussButton recordId={orderId} />
          <CopyLinkButton />
          <Link href={`/dashboard/orders/${orderId}/edit`}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition">
            Edit
          </Link>
          {nextStatus && order.status !== 'cancelled' && (
            <button onClick={handleAdvance} disabled={advancing}
              className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition">
              {advancing ? 'Updating…' : `→ ${STATUS_LABEL[nextStatus]}`}
            </button>
          )}
        </div>
      </div>

      {/* Status pipeline */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 overflow-x-auto">
        <div className="flex items-center min-w-max">
          {PIPELINE.map((s, i) => {
            const done   = i < currentStep;
            const active = i === currentStep;
            const future = i > currentStep;
            return (
              <div key={s} className="flex items-center">
                <div className={`flex flex-col items-center ${future ? 'opacity-40' : ''}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mb-1
                    ${done   ? 'bg-brand-600 text-white' : ''}
                    ${active ? 'bg-brand-600 text-white ring-4 ring-brand-100' : ''}
                    ${future ? 'bg-gray-200 text-gray-400' : ''}
                  `}>
                    {done ? '✓' : i + 1}
                  </div>
                  <span className={`text-xs whitespace-nowrap ${active ? 'font-semibold text-brand-700' : 'text-gray-500'}`}>
                    {STATUS_LABEL[s]}
                  </span>
                </div>
                {i < PIPELINE.length - 1 && (
                  <div className={`w-8 h-0.5 mx-1 mb-5 ${i < currentStep ? 'bg-brand-500' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600 mb-4">{error}</div>}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto whitespace-nowrap border-b border-gray-200 tab-scroll [&>*]:flex-shrink-0">
        {(['details', 'documents', 'suborders'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize transition ${
              tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t === 'suborders' ? `Suborders (${suborders.length})` : t === 'documents' ? 'Documents' : 'Details'}
          </button>
        ))}
      </div>

      {/* Details tab */}
      {tab === 'details' && (
        <div className="space-y-4">
          {/* Shipment */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Shipment</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <DetailRow label="Client"    value={order.clientName || '—'} />
              <DetailRow label="Shipper"   value={order.shipperName || '—'} />
              <DetailRow label="Consignee" value={order.consigneeName || '—'} />
              <DetailRow label="Pieces" value={order.pieces} />
              <DetailRow label="Weight" value={order.weight ? `${order.weight.toLocaleString()} lbs` : '—'} />
              <DetailRow label="Lead Source" value={leadSourceLabel(leadSources, order.sourceId, order.sourceName)} />
              <DetailRow label="First Available" value={formatDate(order.firstAvailablePickup as { toDate: () => Date } | null)} />
              <DetailRow label="Pickup Date" value={formatDate(order.pickupDate as { toDate: () => Date } | null)} />
              <DetailRow label="Delivery Date" value={formatDate(order.deliveryDate as { toDate: () => Date } | null)} />
            </div>
          </div>

          {/* Freight */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Freight</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide border-b border-gray-200">
                    <th className="pb-2 pr-4 font-medium">Commodity</th>
                    <th className="pb-2 pr-4 font-medium">Pieces</th>
                    <th className="pb-2 pr-4 font-medium">Dimensions (L × W × H)</th>
                    <th className="pb-2 font-medium">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {orderCommodityItems(order).map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 pr-4 text-gray-900">{item.description || '—'}</td>
                      <td className="py-2 pr-4 text-gray-600">{item.quantity || '—'}</td>
                      <td className="py-2 pr-4 text-gray-600">{formatDimensions(item) || '—'}</td>
                      <td className="py-2 text-gray-600">
                        {itemWeightLb(item) ? `${Math.round(itemWeightLb(item)).toLocaleString()} lbs` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Route */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Route</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Origin</p>
                <p className="text-sm text-gray-900">
                  {[order.origin?.street, order.origin?.city, order.origin?.state, order.origin?.zip].filter(Boolean).join(', ') || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Destination</p>
                <p className="text-sm text-gray-900">
                  {[order.destination?.street, order.destination?.city, order.destination?.state, order.destination?.zip].filter(Boolean).join(', ') || '—'}
                </p>
              </div>
            </div>
            {order.laneMiles !== null && order.laneMiles !== undefined ? (
              <div className="mt-4 flex items-center gap-2.5">
                <Route className="w-4 h-4 text-brand-600 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-gray-500">{laneMilesLabel(order.laneMilesSource)}</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatLaneMiles(order.laneMiles, order.laneMilesSource)}
                    <span className="font-normal text-gray-500"> · {laneMilesCaption(order.laneMilesSource)}</span>
                  </p>
                  {/* How old the number is. A stored mileage never moves on its
                      own, so this is the only thing on screen that says whether
                      it was worked out for this load last week or inherited
                      from a lane looked up a year ago. Absent on orders that
                      predate the field. */}
                  {milesAtNote ? <p className="text-xs text-gray-500">{milesAtNote}</p> : null}
                  {/* Admins only, and only on a Google figure: an estimate is
                      recomputed from scratch every time, so there is nothing
                      stale about it to refresh. */}
                  {isAdmin && order.laneMilesSource === 'routes' ? (
                    <div className="mt-1 flex items-center gap-2">
                      <button
                        onClick={handleRefreshMiles}
                        disabled={refreshingMiles}
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${refreshingMiles ? 'animate-spin' : ''}`} />
                        {refreshingMiles ? 'Checking…' : 'Recheck with Google'}
                      </button>
                      {milesNote ? <span className="text-xs text-gray-500">{milesNote}</span> : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : milesNeedLookup ? (
              <div className="mt-4 flex items-center gap-2.5">
                <Route className="w-4 h-4 text-brand-600 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-gray-500">Distance</p>
                  <button
                    onClick={handleLookUpMiles}
                    disabled={refreshingMiles}
                    className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshingMiles ? 'animate-spin' : ''}`} />
                    {refreshingMiles ? 'Asking Google…' : 'Work out the distance'}
                  </button>
                  <p className="text-xs text-gray-500">
                    {milesNote || 'Nobody has looked this lane up before, and each new lane is charged.'}
                  </p>
                </div>
              </div>
            ) : null}
            {/* Falls back to a link built on the fly, so orders saved before
                the field existed still get a usable route. */}
            {(() => {
              const mapUrl = order.routeMapUrl || buildRouteMapUrl(order.origin, order.destination);
              if (!mapUrl) return null;
              return (
                <a href={mapUrl} target="_blank" rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700">
                  <Map className="w-4 h-4" />
                  View route in Google Maps
                  <ExternalLink className="w-3 h-3" />
                </a>
              );
            })()}
          </div>

          {/* Client Confirmation — the load confirmation, which the client
              signs before the carrier agreement may go out. Shown from the
              moment a load is booked rather than after a carrier is assigned:
              it is now the first signature of the two, so waiting for the
              carrier would be waiting on the thing it gates. */}
          {clientConfirmationStarted && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Client Confirmation</h3>
              {order.shipperSignedAt || order.shipperSignerName ? (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <span>✓</span>
                  <span>
                    Signed by <strong>{order.shipperSignerName || 'the client'}</strong>
                    {order.shipperSignedAt && (
                      <> on {formatDate(order.shipperSignedAt as { toDate: () => Date })}</>
                    )}
                    {order.shipperSignerIp && (
                      <span className="text-green-600 font-mono text-xs ml-1">({order.shipperSignerIp})</span>
                    )}
                  </span>
                </div>
              ) : shipperAgreementSentTo ? (
                <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  <span>✉</span>
                  <span>Load confirmation sent to <strong>{shipperAgreementSentTo}</strong> — awaiting signature</span>
                </div>
              ) : (
                <button
                  onClick={handleSendShipperAgreement}
                  disabled={sendingShipperAgreement}
                  className="px-3 py-1.5 bg-brand-50 text-brand-700 border border-brand-200 text-xs font-semibold rounded-lg hover:bg-brand-100 disabled:opacity-50 transition"
                >
                  {sendingShipperAgreement ? 'Sending…' : '✉ Send for Client Signature'}
                </button>
              )}

              {/* The waiver, once it has been used. Kept on the record and on
                  the screen even after the client signs late: it explains why
                  a rate confirmation went out when it did. */}
              {order.signatureWaivedAt && (
                <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <p className="text-sm text-amber-800">
                    Dispatched without the client&rsquo;s signature
                    {order.signatureWaivedByName && <> by <strong>{order.signatureWaivedByName}</strong></>}
                    .
                  </p>
                  {order.signatureWaivedReason && (
                    <p className="text-xs text-amber-700 mt-1">{order.signatureWaivedReason}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Carrier */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Carrier</h3>
              {!assigningCarrier && (
                <button onClick={openCarrierAssign}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                  {order.carrierId ? 'Edit' : '+ Assign Carrier'}
                </button>
              )}
            </div>

            {/* Send for Signature / e-sign status */}
            {!assigningCarrier && order.carrierId && (
              <div className="mb-4">
                {order.carrierSignedAt ? (
                  <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <span>✓</span>
                    <span>
                      Signed by <strong>{order.carrierSignerName || 'carrier'}</strong>
                      {order.carrierSignedAt && (
                        <> on {formatDate(order.carrierSignedAt as { toDate: () => Date })}</>
                      )}
                      {order.carrierSignerIp && (
                        <span className="text-green-600 font-mono text-xs ml-1">({order.carrierSignerIp})</span>
                      )}
                    </span>
                  </div>
                ) : agreementSentTo ? (
                  <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    <span>✉</span>
                    <span>Agreement sent to <strong>{agreementSentTo}</strong> — awaiting signature</span>
                  </div>
                ) : !awaitingCarrierSignature ? null : clientSignatureSatisfied(order) ? (
                  <>
                    <button
                      onClick={handleSendAgreement}
                      disabled={sendingAgreement}
                      className="px-3 py-1.5 bg-brand-50 text-brand-700 border border-brand-200 text-xs font-semibold rounded-lg hover:bg-brand-100 disabled:opacity-50 transition"
                    >
                      {sendingAgreement ? 'Sending…' : '✉ Send for Signature'}
                    </button>
                    {order.signatureWaivedAt && !order.shipperSignedAt && (
                      <p className="text-xs text-amber-700 mt-2">
                        Going out without the client&rsquo;s signature
                        {order.signatureWaivedByName && <> — {order.signatureWaivedByName}</>}
                        {order.signatureWaivedReason && <> · {order.signatureWaivedReason}</>}
                      </p>
                    )}
                  </>
                ) : (
                  /* The gate. The rate confirmation commits us to paying the
                     carrier, so it waits on the client agreeing to pay us. The
                     same test runs in the route — this is the explanation, not
                     the enforcement. */
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                    <p className="text-sm text-amber-800">
                      The client has not signed the load confirmation yet. The carrier agreement
                      cannot be sent until they do.
                    </p>
                    {can('orders.waiveSignature') && !showWaive && (
                      <button
                        onClick={() => setShowWaive(true)}
                        className="mt-2 px-3 py-1.5 border border-amber-300 bg-white text-amber-800 text-xs font-semibold rounded-lg hover:bg-amber-100 transition"
                      >
                        Dispatch without a signature
                      </button>
                    )}
                    {can('orders.waiveSignature') && showWaive && (
                      <div className="mt-3 space-y-2">
                        <label className="block text-xs font-medium text-amber-900">
                          Why is this going out unsigned? <span className="font-normal">(optional)</span>
                        </label>
                        <input
                          type="text"
                          value={waiveReason}
                          onChange={(e) => setWaiveReason(e.target.value)}
                          maxLength={500}
                          placeholder="Client confirmed by phone, signing in the morning"
                          className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                        <p className="text-xs text-amber-700">
                          This is recorded against the load with your name and posted in its chat
                          room. It is not a signature — the client can still be sent the load
                          confirmation and sign it afterwards.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={handleWaiveSignature}
                            disabled={waiving}
                            className="px-3 py-1.5 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50 transition"
                          >
                            {waiving ? 'Recording…' : 'Dispatch without a signature'}
                          </button>
                          <button
                            onClick={() => { setShowWaive(false); setWaiveReason(''); }}
                            className="px-3 py-1.5 border border-amber-300 text-amber-800 text-xs font-medium rounded-lg hover:bg-amber-100 transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {addingCarrier && (
              <QuickAddCarrierModal
                onCreated={handleCarrierCreated}
                onCancel={() => setAddingCarrier(false)}
              />
            )}

            {assigningCarrier ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Carrier</label>
                  {/* The button sits outside the dropdown because a trailing
                      option is invisible until you scroll a long carrier list —
                      the row inside the list is kept as a second way in, near
                      the top where it shows without scrolling. */}
                  <div className="flex gap-2">
                    <select value={selectedCarrierId} onChange={handleCarrierSelect}
                      className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400">
                      <option value="">— Unassigned —</option>
                      <option value={NEW_CARRIER}>+ Add a new carrier…</option>
                      {carriers.map((c) => (
                        <option key={c.id} value={c.id}>{c.companyName}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => setAddingCarrier(true)}
                      className="shrink-0 inline-flex items-center gap-1 px-3 py-2 border border-brand-200 bg-brand-50 text-brand-700 text-xs font-semibold rounded-lg hover:bg-brand-100 transition">
                      <Plus className="w-3.5 h-3.5" />
                      New Carrier
                    </button>
                  </div>
                </div>
                <PersonNameFields label="Driver" value={driverName} onChange={setDriverName} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Driver Phone</label>
                    <input type="tel" value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} placeholder="(555) 555-5555"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Driver License</label>
                  <DriverLicenseUpload
                    orderId={orderId}
                    existingPath={driverLicensePath}
                    onUploaded={(path) => { setDriverLicensePath(path); setPrefillSource(''); }}
                  />
                </div>
                {prefillSource && (
                  <p className="text-xs text-gray-500">
                    Driver carried over from <strong className="font-medium">{prefillSource}</strong>,
                    the last load with this carrier. Change it if a different driver is running this one.
                  </p>
                )}
                <div className="flex gap-2 pt-1">
                  <button onClick={handleSaveCarrier} disabled={savingCarrier}
                    className="px-4 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition">
                    {savingCarrier ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={() => setAssigningCarrier(false)}
                    className="px-4 py-1.5 border border-gray-300 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <DetailRow label="Carrier" value={
                  order.carrierId
                    ? <Link href={`/dashboard/carriers/${order.carrierId}`} className="text-brand-600 hover:underline">{order.carrierName}</Link>
                    : null
                } />
                <DetailRow label="Driver" value={order.driverName} />
                <DetailRow label="Driver Phone" value={order.driverPhone} />
                <DetailRow label="Driver License" value={
                  order.driverLicenseStoragePath
                    ? <DriverLicenseUpload orderId={orderId} existingPath={order.driverLicenseStoragePath} onUploaded={() => {}} readOnly />
                    : null
                } />
              </div>
            )}
          </div>

          {/* Shared-record approvals */}
          {(order.partyApprovals ?? []).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
                Shared Record Approvals
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                This order uses records belonging to another user. Each was authorized before use.
              </p>
              <ul className="space-y-3">
                {(order.partyApprovals ?? []).map((a) => (
                  <li key={a.requestId} className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                    <p className="text-sm text-gray-900">
                      <strong>{a.partyName}</strong>
                      <span className="ml-2 px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 text-xs font-medium">
                        as {a.role}
                      </span>
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      Approved by <strong>{a.approvedByName}</strong>
                      {a.approvedByAdmin && ' (admin)'}
                      {a.approvedAt && <> on {formatDate(a.approvedAt as { toDate: () => Date })}</>}
                      {a.approvedByIp && (
                        <span className="text-gray-500 font-mono ml-1">({a.approvedByIp})</span>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Financials */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Financials</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <DetailRow label="Agreed Rate" value={formatCurrency(order.agreedRate)} />
              <DetailRow label="Broker Fee" value={formatCurrency(order.brokerFee)} />
              <DetailRow label="Carrier Pay" value={formatCurrency(order.carrierPay)} />
            </div>
          </div>

          {/* BOL */}
          {(['carrier_signed', 'shipper_signed', 'in_transit', 'delivered', 'completed'] as const).includes(order.status as 'carrier_signed' | 'shipper_signed' | 'in_transit' | 'delivered' | 'completed') && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Bill of Lading</h3>
                  {order.bolStoragePath && !bolUrl && (
                    <p className="text-xs text-gray-400 mt-1">Loading download link…</p>
                  )}
                </div>
                <div className="flex gap-2">
                  {bolUrl && (
                    <a href={bolUrl} target="_blank" rel="noreferrer"
                      className="px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 transition">
                      Download PDF
                    </a>
                  )}
                  <button onClick={handleGenerateBol} disabled={generatingBol}
                    className="px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition">
                    {generatingBol ? 'Generating…' : order.bolStoragePath ? 'Regenerate BOL' : 'Generate BOL'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {order.notes && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Notes</h3>
              <p className="text-sm text-gray-700 whitespace-pre-line">{order.notes}</p>
            </div>
          )}

          <div className="text-xs text-gray-400">
            Created {formatDate(order.createdAt as { toDate: () => Date } | null)} · Last updated {formatDate(order.updatedAt as { toDate: () => Date } | null)}
          </div>
        </div>
      )}

      {/* Documents tab */}
      {tab === 'documents' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Document', 'Status', 'Action'].map((h) => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {/* BOL */}
              <tr className="hover:bg-gray-50 transition">
                <td className="px-6 py-4">
                  <p className="text-sm font-medium text-gray-900">Bill of Lading</p>
                  <p className="text-xs text-gray-400">Auto-generated PDF</p>
                </td>
                <td className="px-6 py-4">
                  {order.bolStoragePath
                    ? <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">✓ Available</span>
                    : <span className="text-xs text-gray-400">Not generated</span>}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {bolUrl && (
                      <a href={bolUrl} target="_blank" rel="noreferrer"
                        className="text-xs text-brand-600 hover:underline">View BOL</a>
                    )}
                    {(['carrier_signed', 'shipper_signed', 'in_transit', 'delivered', 'completed'] as const).includes(
                      order.status as 'carrier_signed' | 'shipper_signed' | 'in_transit' | 'delivered' | 'completed'
                    ) && (
                      <button onClick={handleGenerateBol} disabled={generatingBol}
                        className="text-xs text-brand-600 hover:text-brand-700 border border-brand-200 bg-brand-50 rounded-lg px-3 py-1.5 font-medium transition hover:bg-brand-100 disabled:opacity-50">
                        {generatingBol ? 'Generating…' : order.bolStoragePath ? 'Regenerate' : 'Generate BOL'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>

              {/* Invoice */}
              <tr className="hover:bg-gray-50 transition">
                <td className="px-6 py-4">
                  <p className="text-sm font-medium text-gray-900">Invoice</p>
                  <p className="text-xs text-gray-400">Auto-generated PDF</p>
                </td>
                <td className="px-6 py-4">
                  {invoicePath
                    ? <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">✓ Available</span>
                    : <span className="text-xs text-gray-400">Not generated</span>}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {invoiceUrl && (
                      <a href={invoiceUrl} target="_blank" rel="noreferrer"
                        className="text-xs text-brand-600 hover:underline">View Invoice</a>
                    )}
                    {/* Named `carrier_signed` rather than `shipper_signed`
                        since the two rungs swapped: the invoice waits for the
                        later of the two signatures, which is now the
                        carrier's. Listing the earlier one would offer an
                        invoice on a load no carrier has committed to. */}
                    {(['carrier_signed', 'in_transit', 'delivered', 'completed'] as const).includes(
                      order.status as 'carrier_signed' | 'in_transit' | 'delivered' | 'completed'
                    ) && (
                      <button onClick={handleGenerateInvoice} disabled={generatingInvoice}
                        className="text-xs text-brand-600 hover:text-brand-700 border border-brand-200 bg-brand-50 rounded-lg px-3 py-1.5 font-medium transition hover:bg-brand-100 disabled:opacity-50">
                        {generatingInvoice ? 'Generating…' : invoicePath ? 'Regenerate' : 'Generate Invoice'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>

              {/* POD */}
              <tr className="hover:bg-gray-50 transition">
                <td className="px-6 py-4">
                  <p className="text-sm font-medium text-gray-900">Proof of Delivery</p>
                  <p className="text-xs text-gray-400">PDF or image, max 20 MB</p>
                </td>
                <td className="px-6 py-4">
                  {podPath
                    ? <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">✓ Uploaded</span>
                    : <span className="text-xs text-gray-400">Not uploaded</span>}
                </td>
                <td className="px-6 py-4">
                  <DocumentUpload orderId={orderId} docType="pod" existingPath={podPath} onUploaded={handlePodUploaded} />
                </td>
              </tr>

              {/* Driver License */}
              <tr className="hover:bg-gray-50 transition">
                <td className="px-6 py-4">
                  <p className="text-sm font-medium text-gray-900">Driver License</p>
                  <p className="text-xs text-gray-400">Uploaded during carrier assignment</p>
                </td>
                <td className="px-6 py-4">
                  {order.driverLicenseStoragePath
                    ? <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">✓ Uploaded</span>
                    : <span className="text-xs text-gray-400">Not uploaded</span>}
                </td>
                <td className="px-6 py-4">
                  {order.driverLicenseStoragePath
                    ? <DownloadLink orderId={orderId} docType="license" label="View License" />
                    : <span className="text-xs text-gray-400">—</span>}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Suborders tab */}
      {tab === 'suborders' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600">Split this order into separate loads with different carriers or dates.</p>
            <button onClick={handleCreateSuborder} disabled={splitting}
              className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition">
              {splitting ? 'Creating…' : '+ Create Suborder'}
            </button>
          </div>
          {suborders.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <p className="text-sm text-gray-400">No suborders yet.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {['Order #', 'Status', 'Carrier', 'Pickup', 'Carrier Pay', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {suborders.map((sub) => (
                    <tr key={sub.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 text-sm font-mono font-medium text-brand-700">{orderDisplayNumber(sub)}</td>
                      <td className="px-4 py-3"><StatusBadge status={sub.status} /></td>
                      <td className="px-4 py-3 text-sm text-gray-600">{sub.carrierName || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(sub.pickupDate as { toDate: () => Date } | null)}</td>
                      <td className="px-4 py-3 text-sm text-gray-800">{formatCurrency(sub.carrierPay)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/dashboard/orders/${sub.id}`} className="text-xs text-brand-600 hover:underline font-medium">View →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
