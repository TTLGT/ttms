import React from 'react';
import fs from 'fs';
import path from 'path';
import { Document, Page, Text, View, StyleSheet, Image as PdfImage, renderToBuffer } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import { COMPANY, TTL } from './pdfBrand';
import type { DockParty, FreightCountedBy } from '@/types/order';

/**
 * One freight line as it prints. Pre-formatted by the caller so this module
 * stays free of domain logic and unit conversion, as the rest of BolData is.
 */
export type BolCommodityLine = {
  description: string;
  quantity: string;
  dimensions: string;
  weight: string;
  /**
   * "Pickup 1 to Delivery 2" — words, because the built-in Helvetica cannot
   * draw an arrow. '' on a load with one pickup and one delivery, where it
   * could only say the obvious; a dash stands in for a side nobody set. The
   * column is drawn only when some line has one.
   */
  route: string;
  /** "2019 Toyota Camry · Silver · Sedan · Operable", or '' when not a vehicle. */
  vehicle: string;
  /** '' when none was entered. */
  vin: string;
  /** "2 PLT", or '' when nobody said. */
  handlingUnits: string;
  hazmat: boolean;
};

/** One pickup or delivery after the first, pre-formatted like the rest. */
export type BolStopLine = {
  /** "PICKUP 2", "DELIVERY 3". */
  label: string;
  company: string;
  street: string;
  /** City, state and ZIP. */
  place: string;
  /** '' when no date was set for the stop. */
  date: string;
  /** What comes on or off here, "Excavator; Crated parts" — '' when nobody said. */
  freight: string;
};

/*
 * No phone numbers, for anybody (2026-10-15) — shipper, consignee, extra
 * stops or driver. The BOL is emailed to every party on the load and handed
 * across docks; contacts are on the agreements and in TTMS. They are kept out
 * of this type rather than just off the page, so none can creep back in.
 */
export type BolData = {
  orderNumber: string;
  clientName: string;
  shipperName: string;
  consigneeName: string;
  carrierName: string;
  carrierDot: string;
  carrierMc: string;
  driverName: string;
  truckNumber: string;
  trailerNumber: string;
  commodity: string;
  pieces: number;
  weight: number;
  /** Itemised freight. Always at least one line — see `orderCommodityItems`. */
  items: BolCommodityLine[];
  originStreet: string;
  originCity: string;
  originState: string;
  originZip: string;
  destStreet: string;
  destCity: string;
  destState: string;
  destZip: string;
  pickupDate: string;
  deliveryDate: string;
  /** Every stop after the first pickup and the first delivery; usually none. */
  extraStops: BolStopLine[];
  /**
   * What is loaded at the first pickup and unloaded at the first delivery, on
   * a multi-stop load — '' otherwise. The cards for those two stops say it.
   */
  originFreight: string;
  destFreight: string;
  /*
   * No rates, on purpose (2026-10-14). The BOL used to print the agreed rate,
   * carrier pay and broker fee — our whole margin — on a document that is
   * handed to the driver and emailed to the shipper, consignee, carrier and
   * client (see src/lib/bolRequests.ts). What anybody pays is on the
   * agreements, each to its own party; never put it back here. The declared
   * value below is the goods' worth for liability, not a price.
   */
  /** "$30,000.00", or '' when no line declared a value — then a blank line prints. */
  declaredValue: string;
  /** null prints all three boxes empty, for a pen. */
  freightChargeTerms: 'prepaid' | 'collect' | 'third_party' | null;
  thirdPartyBillTo: string;
  trailerLoadedBy: DockParty | null;
  freightCountedBy: FreightCountedBy | null;
  trailerUnloadedBy: DockParty | null;
  deliveryCountedBy: DockParty | null;
  /** Print every box for all four questions, answered or not — see the card. */
  showDockBoxes: boolean;
  /** Special instructions for the carrier. The order's internal notes are never printed. */
  carrierInstructions: string;
  /** What the load needs beyond a truck and a driver — ramps, a liftgate — as labels. Empty prints nothing. */
  accessorials: string[];
  /** The carrier's e-signature of the Dispatch Sheet, shown as it always was. */
  carrierSignerName: string | null;
  carrierSignedAt: string | null;
  carrierSignerIp: string | null;
  generatedAt: string;
};

/*
 * The TTMS BOL — navy header with the round logo, cards, the freight table —
 * in the company's own colours (pdfBrand.ts), organised to fit one Letter
 * page for an ordinary load (2026-10-15). It is handed over at a dock, and a
 * second sheet holding only the signatures is the sheet that gets lost.
 *
 * Everything the office's paper Straight Bill of Lading asked for is still
 * here (2026-10-14): truck and trailer, handling units and hazmat, freight
 * charge terms, declared value, the dock checkboxes and the standard terms.
 * The consignee's signature card is new: the signed delivery copy is the
 * proof of delivery, and it needs somewhere to be signed.
 */
const RULE = TTL.rule;
const solid = 'solid' as const;

const s = StyleSheet.create({
  page:       { paddingTop: 22, paddingBottom: 28, paddingHorizontal: 30, fontSize: 8, fontFamily: 'Helvetica', color: TTL.ink, backgroundColor: '#ffffff' },

  // Header
  header:     { backgroundColor: TTL.navy, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hLabel:     { color: '#9fb3ff', fontSize: 6.5, letterSpacing: 1.5, marginBottom: 2 },
  hTitle:     { color: '#ffffff', fontSize: 18, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5 },
  hSub:       { color: '#c7d2fe', fontSize: 7, marginTop: 2 },
  hRight:     { alignItems: 'flex-end' },
  hNumLabel:  { color: '#9fb3ff', fontSize: 6, letterSpacing: 1.2, marginBottom: 2 },
  hNum:       { color: TTL.navy, backgroundColor: '#ffffff', borderRadius: 4, paddingVertical: 3, paddingHorizontal: 8, fontSize: 12, fontFamily: 'Helvetica-Bold' },
  hDate:      { color: '#c7d2fe', fontSize: 7, marginTop: 4 },
  accent:     { height: 3, backgroundColor: TTL.red, borderRadius: 2, marginTop: 4, marginBottom: 6, width: 60 },

  // The load at a glance, under the header.
  strip:      { flexDirection: 'row', backgroundColor: TTL.wash, borderRadius: 5, marginBottom: 6 },
  stripCell:  { flex: 1, paddingVertical: 4, paddingHorizontal: 8 },
  stripLabel: { fontSize: 5.8, fontFamily: 'Helvetica-Bold', color: TTL.faint, letterSpacing: 0.6, marginBottom: 1.5 },
  stripValue: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: TTL.navy },

  // Cards
  row:        { flexDirection: 'row', marginBottom: 6 },
  gap:        { width: 7 },
  card:       { borderWidth: 1, borderColor: RULE, borderStyle: solid, borderRadius: 5 },
  cardHead:   { flexDirection: 'row', alignItems: 'center', backgroundColor: TTL.wash, borderTopLeftRadius: 5, borderTopRightRadius: 5, paddingVertical: 3, paddingHorizontal: 8 },
  cardNum:    { width: 11, height: 11, borderRadius: 5.5, backgroundColor: TTL.navy, marginRight: 5, alignItems: 'center', justifyContent: 'center' },
  cardNumTxt: { fontSize: 5.8, fontFamily: 'Helvetica-Bold', color: '#ffffff', marginTop: 0.5 },
  cardTitle:  { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: TTL.navy, letterSpacing: 0.8 },
  cardBody:   { paddingVertical: 4, paddingHorizontal: 8 },

  name:       { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: TTL.ink, marginBottom: 1.5 },
  addr:       { fontSize: 8, color: TTL.ink, lineHeight: 1.3 },
  pair:       { flexDirection: 'row', marginTop: 4 },
  half:       { flex: 1, paddingRight: 6 },
  label:      { fontSize: 6, color: TTL.faint, letterSpacing: 0.3, marginBottom: 1 },
  value:      { fontSize: 8.5, color: TTL.ink },
  blank:      { borderBottomWidth: 0.7, borderBottomColor: '#9ca3af', borderBottomStyle: solid, height: 10 },
  note:       { fontSize: 7.5, color: TTL.ink, marginTop: 4, paddingTop: 3, borderTopWidth: 0.5, borderTopColor: RULE, borderTopStyle: solid },
  noteLabel:  { fontSize: 6, color: TTL.faint },
  esign:      { fontSize: 6.5, color: '#047857', backgroundColor: '#f0fdf4', borderRadius: 3, marginTop: 5, paddingVertical: 3, paddingHorizontal: 5, lineHeight: 1.35 },

  // Freight table
  tHead:      { flexDirection: 'row', backgroundColor: TTL.navy },
  tRow:       { flexDirection: 'row' },
  tRowAlt:    { flexDirection: 'row', backgroundColor: '#f8f9fc' },
  tTotal:     { flexDirection: 'row', backgroundColor: TTL.wash, borderTopWidth: 1, borderTopColor: RULE, borderTopStyle: solid, borderBottomLeftRadius: 5, borderBottomRightRadius: 5 },
  th:         { paddingVertical: 3.5, paddingHorizontal: 5, fontSize: 6, fontFamily: 'Helvetica-Bold', color: '#ffffff', letterSpacing: 0.4 },
  td:         { paddingVertical: 3.5, paddingHorizontal: 5, fontSize: 8, color: TTL.ink },
  tdBold:     { paddingVertical: 3.5, paddingHorizontal: 5, fontSize: 8, fontFamily: 'Helvetica-Bold', color: TTL.ink },
  center:     { textAlign: 'center' },
  right:      { textAlign: 'right' },
  tdSub:      { fontSize: 7, color: TTL.muted, marginTop: 1.5 },
  tdVin:      { fontSize: 7, fontFamily: 'Helvetica-Bold', color: TTL.ink, marginTop: 1.5 },
  hmTag:      { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#ffffff', backgroundColor: TTL.red, borderRadius: 2, paddingHorizontal: 3, paddingVertical: 1, alignSelf: 'center' },

  // Checkboxes
  checkRow:   { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 3 },
  check:      { flexDirection: 'row', alignItems: 'center', marginRight: 11, marginBottom: 2.5 },
  box:        { width: 7.5, height: 7.5, borderWidth: 0.8, borderColor: TTL.faint, borderStyle: solid, borderRadius: 1.5, marginRight: 3.5, alignItems: 'center', justifyContent: 'center' },
  boxOn:      { width: 7.5, height: 7.5, borderWidth: 0.8, borderColor: TTL.navy, borderStyle: solid, borderRadius: 1.5, marginRight: 3.5, backgroundColor: TTL.navy, alignItems: 'center', justifyContent: 'center' },
  boxMark:    { fontSize: 5.5, fontFamily: 'Helvetica-Bold', color: '#ffffff', marginTop: 0.5 },
  checkText:  { fontSize: 7.5, color: TTL.ink },
  inlineLabel:{ width: 68, fontSize: 6.5, color: TTL.faint, marginBottom: 2.5, alignSelf: 'center' },
  fine:       { fontSize: 6, color: TTL.muted, lineHeight: 1.35 },

  // Signatures
  sigBody:    { flexGrow: 1, justifyContent: 'space-between', paddingVertical: 4, paddingHorizontal: 8 },
  pen:        { borderTopWidth: 0.75, borderTopColor: TTL.ink, borderTopStyle: solid, paddingTop: 1.5, fontSize: 6, fontFamily: 'Helvetica-Bold', color: TTL.navy },
  penRow:     { flexDirection: 'row', marginTop: 9 },

  legal:      { marginBottom: 6 },
  legalNote:  { fontSize: 6.8, fontFamily: 'Helvetica-Bold', color: TTL.navy, marginBottom: 2.5 },
  legalText:  { fontSize: 5.6, color: TTL.muted, lineHeight: 1.3 },

  footer:     { position: 'absolute', bottom: 16, left: 30, right: 30, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: RULE, borderTopStyle: solid, paddingTop: 4 },
  footerTxt:  { fontSize: 6.3, color: TTL.faint },
});

const LOGO_PATH = path.join(process.cwd(), 'public', 'logo-circle.png');
let logoData: Buffer | null = null;
/** As bytes, not a path: react-pdf reads `C:\…` as a URL and draws nothing — see logoFull() in pdfBrand.ts. */
function logoCircle(): { data: Buffer; format: 'png' } {
  logoData ??= fs.readFileSync(LOGO_PATH);
  return { data: logoData, format: 'png' };
}

/**
 * A card with a pale heading, numbered in reading order. `half` makes it one
 * of a row; a full-width card must not take `flex`, or it stretches down the
 * page. `body={false}` hands the children the card's whole inside, for a
 * table, and `breakable` lets a long one run onto the next page.
 */
function Card({ n, title, children, half, style, body = true, breakable }: {
  n: number; title: string; children: React.ReactNode; half?: boolean; style?: Style; body?: boolean; breakable?: boolean;
}) {
  return (
    <View style={[s.card, half ? { flex: 1 } : {}, style ?? {}]} wrap={!!breakable}>
      <View style={s.cardHead}>
        <View style={s.cardNum}><Text style={s.cardNumTxt}>{n}</Text></View>
        <Text style={s.cardTitle}>{title}</Text>
      </View>
      {body ? <View style={s.cardBody}>{children}</View> : children}
    </View>
  );
}

/** A labelled value, or a line to write on when there is none and `blank` is asked for. */
function Field({ label, value, blank }: { label: string; value: string; blank?: boolean }) {
  return (
    <View style={s.half}>
      <Text style={s.label}>{label}</Text>
      {value || !blank ? <Text style={s.value}>{value || '—'}</Text> : <View style={s.blank} />}
    </View>
  );
}

function StripCell({ label, value, flex = 1 }: { label: string; value: string; flex?: number }) {
  return (
    <View style={[s.stripCell, { flex }]}>
      <Text style={s.stripLabel}>{label}</Text>
      <Text style={s.stripValue}>{value || '—'}</Text>
    </View>
  );
}

function Check({ on, label }: { on: boolean; label: string }) {
  return (
    <View style={s.check}>
      <View style={on ? s.boxOn : s.box}>{on ? <Text style={s.boxMark}>X</Text> : null}</View>
      <Text style={s.checkText}>{label}</Text>
    </View>
  );
}

const DOCK_LABEL: Record<DockParty, string> = {
  shipper: 'Shipper', consignee: 'Consignee', driver: 'Driver', third_party: '3rd party',
};
const COUNT_ORDER: FreightCountedBy[] = ['shipper', 'driver_pallets', 'driver_pieces', 'consignee', 'third_party'];
/* "Said to contain" is the standard BOL wording, kept so the printed form
   still reads as one to a dock clerk. */
const COUNT_LABEL: Record<FreightCountedBy, string> = {
  shipper: 'Shipper', driver_pallets: 'Driver / pallets only, said to contain', driver_pieces: 'Driver / every piece',
  consignee: 'Consignee', third_party: '3rd party',
};

/** The answered dock questions as [label, value] — empty when nothing was answered. */
function dockLinesOf(d: Pick<BolData, 'trailerLoadedBy' | 'freightCountedBy' | 'trailerUnloadedBy' | 'deliveryCountedBy'>): [string, string][] {
  const out: [string, string][] = [];
  if (d.trailerLoadedBy)   out.push(['Loaded by', DOCK_LABEL[d.trailerLoadedBy]]);
  if (d.freightCountedBy)  out.push(['Counted at pickup', COUNT_LABEL[d.freightCountedBy]]);
  if (d.trailerUnloadedBy) out.push(['Unloaded by', DOCK_LABEL[d.trailerUnloadedBy]]);
  if (d.deliveryCountedBy) out.push(['Counted at delivery', DOCK_LABEL[d.deliveryCountedBy]]);
  return out;
}

/** A labelled row of the four dock parties, the chosen one ticked. */
function DockRow({ label, value }: { label: string; value: DockParty | null }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      <Text style={[s.inlineLabel, { alignSelf: 'flex-start', marginTop: 1 }]}>{label}</Text>
      <View style={[s.checkRow, { flex: 1 }]}>
        {(Object.keys(DOCK_LABEL) as DockParty[]).map((p) => <Check key={p} on={value === p} label={DOCK_LABEL[p]} />)}
      </View>
    </View>
  );
}

/** A party's place on the load: name, address on two lines, and date. */
function Stop({ name, street, place, dateLabel, date, freightLabel, freight }: {
  name: string; street: string; place: string;
  dateLabel: string; date: string; freightLabel: string; freight: string;
}) {
  return (
    <>
      <Text style={s.name}>{name || '—'}</Text>
      {street ? <Text style={s.addr}>{street}</Text> : null}
      <Text style={s.addr}>{place || '—'}</Text>
      <View style={s.pair}>
        <Field label={dateLabel} value={date} />
      </View>
      {freight ? <Text style={s.note}><Text style={s.noteLabel}>{freightLabel}:  </Text>{freight}</Text> : null}
    </>
  );
}

/** A pen-and-paper signature card body: what is being certified, then the lines. */
function SignBlock({ text, dateLabel }: { text: string; dateLabel: string }) {
  return (
    <View style={s.sigBody}>
      <Text style={s.fine}>{text}</Text>
      <View>
        <View style={{ marginTop: 9 }}><Text style={s.pen}>Signature</Text></View>
        <View style={s.penRow}>
          <Text style={[s.pen, { flex: 1, marginRight: 8 }]}>Printed name</Text>
          <Text style={[s.pen, { width: '36%' }]}>{dateLabel}</Text>
        </View>
      </View>
    </View>
  );
}

function BolDocument({ d }: { d: BolData }) {
  // A multi-stop load says which line goes where, so the driver loads and
  // drops against the paper rather than from memory.
  const showRoute = d.items.some((it) => it.route);
  // Numbered once there is more than one of a kind, matching the stop table.
  const multiPickup  = d.extraStops.some((st) => st.label.startsWith('PICKUP'));
  const multiDeliver = d.extraStops.some((st) => st.label.startsWith('DELIVERY'));
  const originLine = [[d.originCity, d.originState].filter(Boolean).join(', '), d.originZip].filter(Boolean).join(' ');
  const destLine   = [[d.destCity,   d.destState  ].filter(Boolean).join(', '), d.destZip  ].filter(Boolean).join(' ');

  // Sections are numbered in reading order, and the optional ones (extra
  // stops, instructions) only take a number when they print.
  let n = 0;
  const next = () => ++n;
  const dockLines = dockLinesOf(d);

  // Column widths of the freight table, with or without the route column.
  const W = showRoute
    ? { hu: '10%', desc: '31%', pcs: '7%', dims: '16%', wt: '12%', hm: '6%', route: '18%' }
    : { hu: '11%', desc: '42%', pcs: '8%', dims: '19%', wt: '13%', hm: '7%', route: '0%' };

  return (
    <Document title={`Bill of Lading ${d.orderNumber}`} author={COMPANY.legalName}>
      <Page size="LETTER" style={s.page}>

        {/* Header */}
        <View style={s.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <PdfImage src={logoCircle()} style={{ width: 38, height: 38, marginRight: 11 }} />
            <View>
              <Text style={s.hLabel}>TOTAL TRANSPORT LOGISTICS</Text>
              <Text style={s.hTitle}>BILL OF LADING</Text>
              <Text style={s.hSub}>Straight Bill of Lading · Original – Not Negotiable</Text>
            </View>
          </View>
          <View style={s.hRight}>
            <Text style={s.hNumLabel}>BOL NO.</Text>
            <Text style={s.hNum}>{d.orderNumber}</Text>
            <Text style={s.hDate}>Issued {d.generatedAt}</Text>
          </View>
        </View>
        <View style={s.accent} />

        {/* The load at a glance. The dates are the order's plan, so they say
            "estimated"; the real ones are written by hand at each dock, on
            the signature cards below. */}
        <View style={s.strip} wrap={false}>
          <StripCell label="CLIENT" value={d.clientName} flex={1.6} />
          <StripCell label="EST. PICKUP" value={d.pickupDate} />
          <StripCell label="EST. DELIVERY" value={d.deliveryDate} />
          <StripCell label="TOTAL WEIGHT" value={d.weight ? `${d.weight.toLocaleString()} lbs` : ''} flex={0.8} />
        </View>

        {/* Ship from + Ship to. On a multi-stop load these are the first
            pickup and delivery; the others are listed under the freight. */}
        <View style={s.row}>
          <Card n={next()} title={multiPickup ? 'SHIP FROM (PICKUP 1)' : 'SHIP FROM'} half>
            <Stop name={d.shipperName} street={d.originStreet} place={originLine}
              dateLabel="Estimated pickup" date={d.pickupDate} freightLabel="Load here" freight={d.originFreight} />
          </Card>
          <View style={s.gap} />
          <Card n={next()} title={multiDeliver ? 'SHIP TO (DELIVERY 1)' : 'SHIP TO'} half>
            <Stop name={d.consigneeName} street={d.destStreet} place={destLine}
              dateLabel="Estimated delivery" date={d.deliveryDate} freightLabel="Unload here" freight={d.destFreight} />
          </Card>
        </View>

        {/* Carrier + the truck that turns up. */}
        <View style={s.row}>
          <Card n={next()} title="CARRIER" half>
            <Text style={s.name}>{d.carrierName || '—'}</Text>
            <View style={s.pair}>
              <Field label="USDOT #" value={d.carrierDot} />
              <Field label="MC #" value={d.carrierMc} />
            </View>
            {/* The carrier's e-signature of the Dispatch Sheet, as the BOL always showed it. */}
            {d.carrierSignerName ? (
              <Text style={s.esign}>
                Dispatch Sheet signed electronically by {d.carrierSignerName}
                {d.carrierSignedAt ? ` on ${d.carrierSignedAt}` : ''}
                {d.carrierSignerIp ? ` · IP ${d.carrierSignerIp}` : ''}
              </Text>
            ) : null}
          </Card>
          <View style={s.gap} />
          <Card n={next()} title="DRIVER & EQUIPMENT" half>
            <View style={{ flexDirection: 'row' }}>
              <Field label="Driver" value={d.driverName} />
            </View>
            <View style={s.pair}>
              <Field label="Truck no." value={d.truckNumber} blank />
              <Field label="Trailer no." value={d.trailerNumber} blank />
            </View>
          </Card>
        </View>

        {/* Freight — one row per item, so a mixed load is described piece by
            piece. The carrier signs against this table. Not wrap={false}: a
            long load must be able to run onto a second page. */}
        <Card n={next()} title="SHIPMENT DESCRIPTION" body={false} breakable style={{ marginBottom: 6 }}>
          <View style={s.tHead}>
            <Text style={[s.th, { width: W.hu }]}>UNITS</Text>
            <Text style={[s.th, { width: W.desc }]}>COMMODITY DESCRIPTION</Text>
            <Text style={[s.th, s.center, { width: W.pcs }]}>PIECES</Text>
            <Text style={[s.th, { width: W.dims }]}>DIMENSIONS (L × W × H)</Text>
            <Text style={[s.th, s.right, { width: W.wt }]}>WEIGHT</Text>
            <Text style={[s.th, s.center, { width: W.hm }]}>HM</Text>
            {showRoute && <Text style={[s.th, { width: W.route }]}>ROUTE</Text>}
          </View>
          {d.items.map((it, i) => (
            <View key={i} style={i % 2 ? s.tRowAlt : s.tRow} wrap={false}>
              <Text style={[s.td, { width: W.hu }]}>{it.handlingUnits || '—'}</Text>
              {/* The vehicle prints under its line; the VIN on its own line
                  in bold, since it is what the driver checks at pickup and
                  what an inspection or claim is written against. */}
              <View style={[s.td, { width: W.desc }]}>
                <Text>{it.description || '—'}</Text>
                {it.vehicle ? <Text style={s.tdSub}>{it.vehicle}</Text> : null}
                {it.vin ? <Text style={s.tdVin}>VIN: {it.vin}</Text> : null}
              </View>
              <Text style={[s.td, s.center, { width: W.pcs }]}>{it.quantity || '—'}</Text>
              <Text style={[s.td, { width: W.dims }]}>{it.dimensions || '—'}</Text>
              <Text style={[s.td, s.right, { width: W.wt }]}>{it.weight || '—'}</Text>
              <View style={[s.td, { width: W.hm }]}>
                {it.hazmat ? <Text style={s.hmTag}>X</Text> : <Text style={s.center}>—</Text>}
              </View>
              {showRoute && <Text style={[s.td, { width: W.route }]}>{it.route || '—'}</Text>}
            </View>
          ))}
          <View style={s.tTotal} wrap={false}>
            <Text style={[s.tdBold, { width: W.hu }]}> </Text>
            <Text style={[s.tdBold, { width: W.desc }]}>TOTAL</Text>
            <Text style={[s.tdBold, s.center, { width: W.pcs }]}>{d.pieces ? String(d.pieces) : '—'}</Text>
            <Text style={[s.tdBold, { width: W.dims }]}> </Text>
            <Text style={[s.tdBold, s.right, { width: W.wt }]}>{d.weight ? `${d.weight.toLocaleString()} lbs` : '—'}</Text>
            <Text style={[s.tdBold, { width: W.hm }]}> </Text>
            {showRoute && <Text style={[s.tdBold, { width: W.route }]}> </Text>}
          </View>
        </Card>

        {/* The rest of the route, in the order it is driven — pickups, then deliveries. */}
        {d.extraStops.length > 0 && (
          <Card n={next()} title="ADDITIONAL STOPS" body={false} style={{ marginBottom: 6 }}>
            <View style={s.tHead}>
              <Text style={[s.th, { width: '14%' }]}>STOP</Text>
              <Text style={[s.th, { width: '26%' }]}>COMPANY</Text>
              <Text style={[s.th, { width: '27%' }]}>ADDRESS</Text>
              <Text style={[s.th, { width: '14%' }]}>EST. DATE</Text>
              <Text style={[s.th, { width: '19%' }]}>FREIGHT</Text>
            </View>
            {d.extraStops.map((st, i) => (
              <View key={i} style={i % 2 ? s.tRowAlt : s.tRow} wrap={false}>
                <Text style={[s.tdBold, { width: '14%' }]}>{st.label}</Text>
                <Text style={[s.td, { width: '26%' }]}>{st.company || '—'}</Text>
                <Text style={[s.td, { width: '27%' }]}>{[st.street, st.place].filter(Boolean).join('\n') || '—'}</Text>
                <Text style={[s.td, { width: '14%' }]}>{st.date || '—'}</Text>
                <Text style={[s.td, { width: '19%' }]}>{st.freight || '—'}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* Freight charges + what happened at the dock */}
        <View style={s.row}>
          <Card n={next()} title="FREIGHT CHARGES & DECLARED VALUE" half>
            <View style={s.checkRow}>
              <Check on={d.freightChargeTerms === 'prepaid'} label="Prepaid" />
              <Check on={d.freightChargeTerms === 'collect'} label="Collect" />
              <Check on={d.freightChargeTerms === 'third_party'} label="3rd party" />
              <Text style={[s.fine, { alignSelf: 'center' }]}>Prepaid unless marked otherwise.</Text>
            </View>
            <View style={{ flexDirection: 'row', marginTop: 2 }}>
              <Field label="3rd party — bill to" value={d.thirdPartyBillTo} blank />
              <Field label="Declared value (not exceeding)" value={d.declaredValue} blank />
            </View>
          </Card>
          {/* Who loads, unloads and counts. By default only what was
              answered on the order, as one short line each, and nothing at
              all when nothing was — the full grid of boxes took a quarter of
              the page to say "not decided". `showDockBoxes` brings the grid
              back for a carrier or client who wants boxes to tick by hand. */}
          {d.showDockBoxes ? (
            <>
              <View style={s.gap} />
              <Card n={next()} title="LOADING, UNLOADING & COUNT" half>
                {/* One row per question, each its own wrapping row so a box
                    that spills over lines up under the others rather than
                    under the label. */}
                <DockRow label="Loaded by" value={d.trailerLoadedBy} />
                <View style={{ flexDirection: 'row' }}>
                  <Text style={[s.inlineLabel, { alignSelf: 'flex-start', marginTop: 1 }]}>Counted at pickup</Text>
                  <View style={[s.checkRow, { flex: 1 }]}>
                    {COUNT_ORDER.map((c) => <Check key={c} on={d.freightCountedBy === c} label={COUNT_LABEL[c]} />)}
                  </View>
                </View>
                <DockRow label="Unloaded by" value={d.trailerUnloadedBy} />
                <DockRow label="Counted at delivery" value={d.deliveryCountedBy} />
              </Card>
            </>
          ) : dockLines.length > 0 ? (
            <>
              <View style={s.gap} />
              <Card n={next()} title="LOADING, UNLOADING & COUNT" half>
                {dockLines.map(([label, value]) => (
                  <View key={label} style={{ flexDirection: 'row', marginBottom: 1.5 }}>
                    <Text style={[s.inlineLabel, { alignSelf: 'flex-start', marginBottom: 0, marginTop: 0.5 }]}>{label}</Text>
                    <Text style={{ flex: 1, fontSize: 7.5 }}>{value}</Text>
                  </View>
                ))}
              </Card>
            </>
          ) : null}
        </View>

        {/* Ramps, a winch, a liftgate… — left out when the order asks for none. */}
        {d.accessorials.length > 0 ? (
          <Card n={next()} title="ACCESSORIALS" style={{ marginBottom: 6 }}>
            <Text style={{ fontSize: 8, lineHeight: 1.35 }}>{d.accessorials.join('  ·  ')}</Text>
          </Card>
        ) : null}

        {/* Special instructions — the carrier's, never the internal notes. */}
        {d.carrierInstructions ? (
          <Card n={next()} title="SPECIAL INSTRUCTIONS" style={{ marginBottom: 6 }}>
            <Text style={{ fontSize: 8, lineHeight: 1.35 }}>{d.carrierInstructions}</Text>
          </Card>
        ) : null}

        {/* The standard terms from the office's paper form, above the
            signatures that accept them. */}
        <View style={s.legal} wrap={false}>
          <Text style={s.legalNote}>NOTE: Liability limitation for loss or damage in this shipment may be applicable. See 49 U.S.C. § 14706(c)(1)(A) and (B).</Text>
          <Text style={s.legalText}>
            RECEIVED, subject to individually determined rates or contracts that have been agreed upon in writing between the carrier and shipper, if applicable, otherwise to the rates, classifications and rules that have been established by the carrier and are available to the shipper on request. The property described above, in apparent good order, except as noted (contents and condition of contents of packages unknown), marked, consigned, and destined as shown above, which said carrier agrees to carry to destination, if on its route, or otherwise deliver to another carrier on the route to destination. Every service to be performed hereunder shall be subject to all bill of lading terms and conditions in the governing classification on the date of shipment. Shipper hereby certifies that he is familiar with all the bill of lading terms and conditions in the governing classification and the said terms and conditions are hereby agreed to by the shipper and accepted for himself and his assigns. Where the rate is dependent on value, shippers are required to state specifically in writing the agreed or declared value of the property. The carrier shall not make delivery of this shipment without payment of freight and all other lawful charges.
          </Text>
        </View>

        {/* Signed at each dock, with a pen. The consignee's copy, signed at
            delivery, is the proof of delivery. */}
        <View style={s.row} wrap={false}>
          <Card n={next()} title="SHIPPER" half body={false}>
            <SignBlock dateLabel="Date"
              text="This is to certify that the above named materials are properly classified, described, packaged, marked and labeled, and are in proper condition for transportation according to the applicable regulations of the DOT." />
          </Card>
          <View style={s.gap} />
          <Card n={next()} title="CARRIER" half body={false}>
            <SignBlock dateLabel="Pickup date"
              text="Carrier acknowledges receipt of packages and required placards, and certifies emergency response information was made available and/or the DOT emergency response guidebook or equivalent is in the vehicle. Property described above is received in good order, except as noted." />
          </Card>
          <View style={s.gap} />
          <Card n={next()} title="CONSIGNEE" half body={false}>
            <SignBlock dateLabel="Delivery date"
              text="Received the property described above in apparent good order, except as noted on this bill of lading. Note any shortage or damage before signing." />
          </Card>
        </View>

        {/* Footer, on every page. */}
        <View style={s.footer} fixed>
          <Text style={s.footerTxt}>{COMPANY.legalName} · {COMPANY.phone} · {COMPANY.web}</Text>
          <Text style={s.footerTxt} render={({ pageNumber, totalPages }) => `BOL ${d.orderNumber} · Page ${pageNumber} of ${totalPages}`} />
        </View>

      </Page>
    </Document>
  );
}

export async function generateBolBuffer(d: BolData): Promise<Buffer> {
  // renderToBuffer expects DocumentProps; cast since BolDocument renders a Document internally
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToBuffer(React.createElement(BolDocument, { d }) as any) as Promise<Buffer>;
}
