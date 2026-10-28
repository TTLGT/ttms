import { Resend } from 'resend';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, adminStorage } from './firebase-admin';
import { formatLongDateRange } from './dateFormat';
import { documentAlert, postOrderAlert } from './chatAlerts';
import { recordEvent, updateWithHistory, type ChangeActor } from './recordHistory';
import { generateBolBuffer } from './bol-pdf';
import type { BolData, BolStopLine } from './bol-pdf';
import { clientContactOf } from './orderReadinessServer';
import { signedSaProof } from './signedSaProof';
import {
  STATUS_RANK, accessorialLabels, clientSignatureSatisfied, formatDimensions, totalCommodityValue, itemStop, itemWeightLb, orderCommodityItems,
  orderDeliveries, orderDisplayNumber, orderPickups, stopLabel, vehicleSummary,
} from '@/types/order';
import type { CommodityItem, Order, OrderStatus, OrderStop, StopKind } from '@/types/order';
import {
  BOL_REQUESTS_COLLECTION, BOL_ROLE_LABEL,
  type BolRecipient, type BolRecipientRole, type BolRequest, type BolRequestStatus, type BolSend,
} from '@/types/bolRequest';

/**
 * The BOL: generating it, and the request to send it once both sides have
 * signed. See src/types/bolRequest.ts for why TTMS opens the request but a
 * person sends it.
 */

/** TTMS itself, on the change log, for the BOL it made on a signature. */
const TTMS_ACTOR: ChangeActor = { uid: '', name: 'TTMS', email: '', via: 'app' };

export const bolRequestRef = (orderId: string) => adminDb.collection(BOL_REQUESTS_COLLECTION).doc(orderId);

export const bolPath = (orderId: string) => `bols/${orderId}.pdf`;

const fmtDate = (ts: { toDate?: () => Date } | null | undefined): string => {
  if (!ts || typeof ts.toDate !== 'function') return '—';
  return ts.toDate().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

/** The PDF, drawn from the order as it stands now. */
async function bolBuffer(order: FirebaseFirestore.DocumentData): Promise<Buffer> {
  let carrierDot = '';
  let carrierMc  = '';
  if (order.carrierId) {
    const carrierSnap = await adminDb.collection('carriers').doc(order.carrierId).get();
    if (carrierSnap.exists) {
      const c = carrierSnap.data()!;
      carrierDot = c.dot ?? '';
      carrierMc  = c.mc  ?? '';
    }
  }

  // Which freight goes through which stop. Only asked on a load with more
  // than one stop of a kind — see itemStop() — so a plain A-to-B load prints
  // exactly as it always has.
  const items = orderCommodityItems(order as Partial<Order>);
  const pickupCount   = orderPickups(order as Partial<Order>).length;
  const deliveryCount = orderDeliveries(order as Partial<Order>).length;
  const multiStop = pickupCount > 1 || deliveryCount > 1;
  const countOf = (kind: StopKind) => (kind === 'pickup' ? pickupCount : deliveryCount);
  const routeOf = (it: CommodityItem) => {
    if (!multiStop) return '';
    const side = (kind: StopKind) => {
      const i = itemStop(it, kind, countOf(kind));
      return i == null ? '—' : stopLabel(kind, i);
    };
    return `${side('pickup')} to ${side('delivery')}`;
  };
  // "Excavator; 2 x Crated parts" — what comes on or off at one stop.
  const freightAt = (kind: StopKind, index: number) => {
    if (!multiStop) return '';
    return items
      .filter((it) => itemStop(it, kind, countOf(kind)) === index)
      .map((it) => {
        const name = it.description.trim() || 'Unnamed item';
        return it.quantity > 1 ? `${it.quantity} x ${name}` : name;
      })
      .join('; ');
  };

  // Every pickup and delivery after the first, numbered the way the order
  // screen numbers them, so the driver and the carrier read the same list.
  const stopLine = (kind: StopKind) => (s: OrderStop, i: number): BolStopLine => ({
    label:   stopLabel(kind, i + 1).toUpperCase(),
    company: s.partyName ?? '',
    street:  s.address?.street ?? '',
    place:   [s.address?.city, s.address?.state, s.address?.zip].filter(Boolean).join(', '),
    date:    formatLongDateRange(s.date, s.dateEnd, ''),
    freight: freightAt(kind, i + 1),
  });
  const extraStops = [
    ...((order.extraPickups ?? []) as OrderStop[]).map(stopLine('pickup')),
    ...((order.extraDeliveries ?? []) as OrderStop[]).map(stopLine('delivery')),
  ];

  const data: BolData = {
    // The number the load is known by, which for a BATS-era order is its BATS
    // id — see orderDisplayNumber(). A document must carry what the carrier
    // and the client already have on file for this load.
    orderNumber:      orderDisplayNumber(order),
    clientName:       order.clientName         ?? '',
    shipperName:      order.shipperName        ?? '',
    consigneeName:    order.consigneeName      ?? '',
    carrierName:      order.carrierName        ?? '',
    carrierDot,
    carrierMc,
    driverName:       order.driverName         ?? '',
    transportType:    order.transportType      ?? '',
    truckNumber:      order.truckNumber        ?? '',
    trailerNumber:    order.trailerNumber      ?? '',
    commodity:        order.commodity          ?? '',
    pieces:           order.pieces             ?? 0,
    weight:           order.weight             ?? 0,
    items:            items.map((it) => ({
      description: it.description,
      quantity:    it.quantity ? String(it.quantity) : '',
      dimensions:  formatDimensions(it),
      weight:      itemWeightLb(it) ? `${Math.round(itemWeightLb(it)).toLocaleString()} lbs` : '',
      handlingUnits: [it.handlingUnits ? String(it.handlingUnits) : '', it.handlingUnitType?.trim() ?? ''].filter(Boolean).join(' '),
      hazmat:      it.hazmat === true,
      vehicle:     vehicleSummary(it),
      vin:         it.vin?.trim() ?? '',
      route:       routeOf(it),
    })),
    originStreet:     order.origin?.street     ?? '',
    originCity:       order.origin?.city       ?? '',
    originState:      order.origin?.state      ?? '',
    originZip:        order.origin?.zip        ?? '',
    destStreet:       order.destination?.street ?? '',
    destCity:         order.destination?.city  ?? '',
    destState:        order.destination?.state ?? '',
    destZip:          order.destination?.zip   ?? '',
    pickupDate:       formatLongDateRange(order.pickupDate, order.pickupDateEnd),
    deliveryDate:     formatLongDateRange(order.deliveryDate, order.deliveryDateEnd),
    extraStops,
    originFreight:    freightAt('pickup', 0),
    destFreight:      freightAt('delivery', 0),
    // The carrier's instructions, never the order's notes: those are internal.
    carrierInstructions: order.carrierInstructions ?? '',
    accessorials:     accessorialLabels(order),
    // The goods' worth, summed from the lines' declared values — for
    // liability, not a price. Blank when no line declared one.
    declaredValue:    (() => {
      const v = totalCommodityValue(items);
      return v ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v) : '';
    })(),
    freightChargeTerms: order.freightChargeTerms ?? null,
    thirdPartyBillTo:   order.thirdPartyBillTo ?? '',
    trailerLoadedBy:    order.trailerLoadedBy ?? null,
    freightCountedBy:   order.freightCountedBy ?? null,
    trailerUnloadedBy:  order.trailerUnloadedBy ?? null,
    deliveryCountedBy:  order.deliveryCountedBy ?? null,
    showDockBoxes:      order.bolShowDockBoxes === true,
    carrierSignerName: order.carrierSignerName ?? null,
    carrierSignedAt:   order.carrierSignedAt ? fmtDate(order.carrierSignedAt) : null,
    carrierSignerIp:   order.carrierSignerIp  ?? null,
    generatedAt:       new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
  };

  return generateBolBuffer(data);
}

/**
 * Generates the BOL, stores it over the last one and records it on the order.
 * The caller has already decided this person (or TTMS) may.
 */
export async function generateBol(
  orderId: string,
  order: FirebaseFirestore.DocumentData,
  actor: ChangeActor,
  summary?: string,
): Promise<string> {
  const buffer = await bolBuffer(order);
  const filePath = bolPath(orderId);
  await adminStorage.bucket().file(filePath).save(buffer, { metadata: { contentType: 'application/pdf' } });
  await updateWithHistory(adminDb.collection('orders').doc(orderId), {
    bolStoragePath: filePath,
    updatedAt:      new Date(),
  }, actor, summary ?? (order.bolStoragePath ? 'Generated the BOL again' : 'Generated the BOL'));
  // The room about this load, if anybody has started one. Best-effort: the
  // BOL exists, and a chat write that failed must not turn that into an error.
  await postOrderAlert(orderId, documentAlert('BOL', true)).catch(() => {});
  return filePath;
}

/**
 * Both sides have signed — the question that opens a request.
 *
 * - The carrier: an e-signature, or Carrier Signed pressed by hand (which
 *   `updateOrderAsCaller()` allows only with the signed Dispatch Sheet on the
 *   load). The status only moves forward, so a load that reached
 *   carrier_signed got there one of those two ways.
 * - The client: `clientSignatureSatisfied()` — an e-signature or a waiver,
 *   since a waived load still needs its BOL to move — or a signed SA uploaded
 *   to the load, which is what Client Signed by hand stands on and leaves no
 *   field behind.
 */
async function bothSidesSigned(orderId: string, order: FirebaseFirestore.DocumentData): Promise<boolean> {
  if (!order.carrierId || order.status === 'cancelled') return false;
  const rank = STATUS_RANK[order.status as Exclude<OrderStatus, 'cancelled'>] ?? -1;
  // A signature recorded off a verified signed Dispatch Sheet counts too
  // (src/types/signatureRecord.ts).
  const carrierSigned = Boolean(order.carrierSignedAt) || Boolean(order.carrierSignatureRecord)
    || rank >= STATUS_RANK.carrier_signed;
  if (!carrierSigned) return false;
  if (clientSignatureSatisfied(order as Partial<Order>)) return true;
  const proof = await signedSaProof(orderId, 'client', order);
  return proof.files + proof.photos > 0;
}

/**
 * Called after anything that records a signature: if both sides have now
 * signed, generate the BOL and open the request to send it.
 *
 * Does nothing when a request already exists for this carrier — a client
 * signing after a waived load's carrier did, or the same signature arriving
 * twice. A *different* carrier having signed replaces it, because the BOL
 * already sent names the wrong one.
 *
 * Best-effort, like the chat alert: every caller has just recorded a
 * signature, which is the legal record and must never be undone or reported
 * as failed because of this. Callers `.catch()` it.
 */
export async function openBolRequestIfSigned(orderId: string, because: string): Promise<void> {
  const orderRef = adminDb.collection('orders').doc(orderId);
  const order = (await orderRef.get()).data();
  if (!order || !(await bothSidesSigned(orderId, order))) return;

  const carrierId = String(order.carrierId);
  const now = Timestamp.now();
  // Claimed in a transaction so two signatures landing together cannot both
  // generate and both open.
  const claimed = await adminDb.runTransaction(async (tx) => {
    const ref = bolRequestRef(orderId);
    const snap = await tx.get(ref);
    if (snap.exists && snap.data()!.carrierId === carrierId) return false;
    tx.set(ref, {
      orderId,
      orderNumber:   orderDisplayNumber(order),
      clientName:    String(order.clientName ?? ''),
      carrierName:   String(order.carrierName ?? ''),
      carrierId,
      status:        'open' satisfies BolRequestStatus,
      openedAt:      now,
      openedBecause: because,
      sends:         [],
      doneAt:        null,
      doneByName:    null,
    });
    return true;
  });
  if (!claimed) return;

  await generateBol(orderId, order, TTMS_ACTOR,
    `Generated the BOL because both sides have signed (${because.charAt(0).toLowerCase()}${because.slice(1)}), and asked admin and dispatch to send it`);
  await postOrderAlert(orderId,
    'Both sides have signed, so TTMS generated the BOL. Admin and dispatch: choose who to send it to from the order.',
  ).catch(() => {});
}

export function toBolRequest(d: FirebaseFirestore.DocumentData): BolRequest {
  const ms = (v: unknown) => (v && typeof (v as Timestamp).toMillis === 'function' ? (v as Timestamp).toMillis() : 0);
  const status: BolRequestStatus = d.status === 'sent' || d.status === 'done' ? d.status : 'open';
  return {
    orderId:       String(d.orderId ?? ''),
    orderNumber:   String(d.orderNumber ?? ''),
    clientName:    String(d.clientName ?? ''),
    carrierName:   String(d.carrierName ?? ''),
    carrierId:     String(d.carrierId ?? ''),
    status,
    openedAt:      ms(d.openedAt),
    openedBecause: String(d.openedBecause ?? ''),
    sends: (Array.isArray(d.sends) ? d.sends : []).map((s: Record<string, unknown>): BolSend => ({
      at:     ms(s.at),
      byName: String(s.byName ?? ''),
      to:     Array.isArray(s.to) ? (s.to as { label?: unknown; email?: unknown }[]).map((t) => ({
        label: String(t.label ?? ''), email: String(t.email ?? ''),
      })) : [],
    })),
    doneAt:     d.doneAt ? ms(d.doneAt) : null,
    doneByName: d.doneByName ? String(d.doneByName) : null,
  };
}

/** A party's address: its first contact with an email, else its own. */
async function partyEmail(partyId: string): Promise<{ name: string; email: string } | null> {
  if (!partyId) return null;
  const snap = await adminDb.collection('parties').doc(partyId).get();
  if (!snap.exists) return null;
  const p = snap.data()!;
  const contacts: { name?: string; email?: string }[] = Array.isArray(p.contacts) ? p.contacts : [];
  const named = contacts.find((c) => c.email?.trim());
  const name = String(p.companyName || p.contactName || '');
  return { name, email: (named?.email ?? (typeof p.email === 'string' ? p.email : '')).trim() };
}

/**
 * Everybody on this load a BOL could go to, with the address on file for
 * each. The one place a recipient key turns into an address — the send route
 * calls this again rather than trusting anything the browser held.
 */
export async function bolRecipientsFor(order: FirebaseFirestore.DocumentData): Promise<BolRecipient[]> {
  const out: BolRecipient[] = [];

  if (typeof order.carrierId === 'string' && order.carrierId) {
    const c = (await adminDb.collection('carriers').doc(order.carrierId).get()).data();
    out.push({
      key: 'carrier', role: 'carrier', label: BOL_ROLE_LABEL.carrier,
      name: String(c?.companyName ?? order.carrierName ?? ''),
      email: typeof c?.email === 'string' ? c.email.trim() : '',
    });
  }

  const client = await clientContactOf(order.clientId);
  if (client) {
    out.push({
      key: 'client', role: 'client', label: BOL_ROLE_LABEL.client,
      name: client.companyName || client.name || String(order.clientName ?? ''), email: client.email,
    });
  }

  // Every pickup and every delivery: a load with two pickups has two docks
  // that each want the BOL. Labelled "Pickup 2" only when there is more than one.
  const stops = async (kind: StopKind, list: OrderStop[]) => {
    const role: BolRecipientRole = kind === 'pickup' ? 'shipper' : 'consignee';
    for (const [i, s] of list.entries()) {
      if (!s.partyId) continue;
      const p = await partyEmail(s.partyId);
      out.push({
        key: `${role}:${i}`, role,
        label: list.length > 1 ? stopLabel(kind, i) : BOL_ROLE_LABEL[role],
        name: p?.name || s.partyName || '', email: p?.email ?? '',
      });
    }
  };
  await stops('pickup', orderPickups(order as Partial<Order>));
  await stops('delivery', orderDeliveries(order as Partial<Order>));
  return out;
}

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Emails the stored BOL to the chosen people on the load — one email, each
 * address in To, so every recipient sees who else on the load has it (they
 * are all parties to the same shipment, and a dock that can see the carrier
 * was sent it does not ring to ask). Reply-To is whoever pressed send.
 */
export async function emailBol(p: {
  orderId: string;
  order: FirebaseFirestore.DocumentData;
  to: { label: string; email: string }[];
  senderName: string;
  senderEmail: string | undefined;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) throw new Error('Email sending is not configured');
  const [content] = await adminStorage.bucket().file(bolPath(p.orderId)).download();
  const orderNumber = orderDisplayNumber(p.order);
  const lane = [
    [p.order.origin?.city, p.order.origin?.state].filter(Boolean).join(', '),
    [p.order.destination?.city, p.order.destination?.state].filter(Boolean).join(', '),
  ].filter(Boolean).join(' to ');

  const sent = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from:    `TTL Dispatch <${process.env.RESEND_FROM_EMAIL ?? 'noreply@totaltransportlogistics.us'}>`,
    to:      [...new Set(p.to.map((t) => t.email.toLowerCase()))],
    ...(p.senderEmail ? { replyTo: p.senderEmail } : {}),
    subject: `Bill of Lading — ${orderNumber}`,
    html: `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:20px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
    <div style="background:#1e3a5f;color:#fff;padding:24px 32px">
      <p style="margin:0;font-size:11px;font-weight:bold;letter-spacing:2px;color:#93c5fd;text-transform:uppercase">Total Transport Logistics</p>
      <h1 style="margin:4px 0 0;font-size:22px;font-weight:bold">Bill of Lading</h1>
    </div>
    <div style="padding:32px">
      <p style="color:#374151;font-size:15px;margin-top:0">Hello,</p>
      <p style="color:#374151;font-size:15px">
        Attached is the bill of lading for shipment <strong>${esc(orderNumber)}</strong>${lane ? ` (${esc(lane)})` : ''}.
      </p>
      <p style="color:#374151;font-size:14px;line-height:1.5">
        Please keep it with the shipment. If anything on it is not right, reply to this email before pickup.
      </p>
      <p style="color:#6b7280;font-size:13px">Sent by ${esc(p.senderName)}.</p>
    </div>
    <div style="border-top:1px solid #e5e7eb;padding:16px 32px;background:#f9fafb">
      <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center">Total Transport Logistics · totaltransportlogistics.us</p>
    </div>
  </div>
</body>
</html>`,
    attachments: [{ filename: `BOL ${orderNumber.replace(/[\\/:*?"<>|]/g, '-')}.pdf`, content, contentType: 'application/pdf' }],
  });
  if (sent.error) throw new Error(sent.error.message);

  await recordEvent(adminDb.collection('orders').doc(p.orderId),
    `Emailed the BOL to ${p.to.map((t) => `${t.label.toLowerCase()} ${t.email}`).join(', ')}`,
    { uid: '', name: p.senderName, email: p.senderEmail ?? '', via: 'app' },
  ).catch(() => {});
}
