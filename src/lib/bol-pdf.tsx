import React from 'react';
import fs from 'fs';
import path from 'path';
import { Document, Page, Text, View, StyleSheet, Image as PdfImage, renderToBuffer } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import { TTL } from './pdfBrand';

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
  phone: string;
  street: string;
  /** City, state and ZIP. */
  place: string;
  /** '' when no date was set for the stop. */
  date: string;
  /** What comes on or off here, "Excavator; Crated parts" — '' when nobody said. */
  freight: string;
};

export type BolData = {
  orderNumber: string;
  clientName: string;
  shipperName: string;
  shipperPhone: string;
  consigneeName: string;
  consigneePhone: string;
  carrierName: string;
  carrierDot: string;
  carrierMc: string;
  driverName: string;
  driverPhone: string;
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
  trailerLoadedBy: 'shipper' | 'driver' | null;
  freightCountedBy: 'shipper' | 'driver_pallets' | 'driver_pieces' | null;
  /** Special instructions for the carrier. The order's internal notes are never printed. */
  carrierInstructions: string;
  /** The carrier's e-signature of the Dispatch Sheet, shown as it always was. */
  carrierSignerName: string | null;
  carrierSignedAt: string | null;
  carrierSignerIp: string | null;
  generatedAt: string;
};

/*
 * The TTMS BOL as it was — navy header, cards, the freight table — in the
 * company's own colours (pdfBrand.ts), with what the office's paper Straight
 * Bill of Lading asked for and the old one lacked (2026-10-14): truck and
 * trailer, handling units and hazmat, freight charge terms, declared value,
 * the dock checkboxes, signature lines and the standard terms.
 */
const RULE = TTL.rule;
const solid = 'solid' as const;

const s = StyleSheet.create({
  page:       { paddingTop: 30, paddingBottom: 40, paddingHorizontal: 34, fontSize: 8.5, fontFamily: 'Helvetica', color: TTL.ink, backgroundColor: '#ffffff' },

  header:     { backgroundColor: TTL.navy, borderRadius: 6, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hLabel:     { color: '#9fb3ff', fontSize: 7, letterSpacing: 1.5, marginBottom: 2 },
  hTitle:     { color: '#ffffff', fontSize: 19, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5 },
  hSub:       { color: '#c7d2fe', fontSize: 7.5, marginTop: 2 },
  hRight:     { alignItems: 'flex-end' },
  hNumLabel:  { color: '#9fb3ff', fontSize: 6.5, letterSpacing: 1.2, marginBottom: 2 },
  hNum:       { color: TTL.navy, backgroundColor: '#ffffff', borderRadius: 4, paddingVertical: 3, paddingHorizontal: 8, fontSize: 12, fontFamily: 'Helvetica-Bold' },
  hDate:      { color: '#c7d2fe', fontSize: 7.5, marginTop: 4 },
  accent:     { height: 3, backgroundColor: TTL.red, borderRadius: 2, marginTop: 4, marginBottom: 12, width: 60 },

  row2:       { flexDirection: 'row', marginBottom: 9 },
  card:       { borderWidth: 1, borderColor: RULE, borderStyle: solid, borderRadius: 5 },
  gap:        { width: 9 },
  cardHead:   { flexDirection: 'row', alignItems: 'center', backgroundColor: TTL.wash, borderTopLeftRadius: 5, borderTopRightRadius: 5, paddingVertical: 4, paddingHorizontal: 8 },
  cardDot:    { width: 4, height: 4, borderRadius: 2, backgroundColor: TTL.red, marginRight: 5 },
  cardTitle:  { fontSize: 7, fontFamily: 'Helvetica-Bold', color: TTL.navy, letterSpacing: 0.8 },
  cardBody:   { paddingVertical: 6, paddingHorizontal: 8 },

  fRow:       { flexDirection: 'row', flexWrap: 'wrap' },
  field:      { width: '50%', paddingRight: 6 },
  fieldFull:  { width: '100%' },
  fLabel:     { fontSize: 6.5, color: TTL.faint, marginBottom: 1, letterSpacing: 0.3 },
  fValue:     { fontSize: 9, color: TTL.ink, marginBottom: 5 },
  fBlank:     { borderBottomWidth: 0.7, borderBottomColor: '#9ca3af', borderBottomStyle: solid, height: 11, marginBottom: 5 },

  table:      { borderWidth: 1, borderColor: RULE, borderStyle: solid, borderRadius: 5, marginBottom: 9 },
  tHead:      { flexDirection: 'row', backgroundColor: TTL.navy, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  tRow:       { flexDirection: 'row' },
  tRowAlt:    { flexDirection: 'row', backgroundColor: '#f8f9fc' },
  tRowTotal:  { flexDirection: 'row', backgroundColor: TTL.wash, borderTopWidth: 1, borderTopColor: RULE, borderTopStyle: solid, borderBottomLeftRadius: 5, borderBottomRightRadius: 5 },
  th:         { padding: 5, fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#ffffff', letterSpacing: 0.4 },
  td:         { padding: 5, fontSize: 8.5, color: TTL.ink },
  tdBold:     { padding: 5, fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: TTL.ink },
  tdSub:      { fontSize: 7.5, color: TTL.muted, marginTop: 1.5 },
  tdVin:      { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: TTL.ink, marginTop: 1.5 },
  hmTag:      { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#ffffff', backgroundColor: TTL.red, borderRadius: 2, paddingHorizontal: 3, paddingVertical: 1, alignSelf: 'flex-start' },

  notesText:  { fontSize: 8, color: TTL.muted, lineHeight: 1.4 },

  checkRow:   { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  check:      { flexDirection: 'row', alignItems: 'center', marginRight: 12, marginBottom: 3 },
  box:        { width: 8, height: 8, borderWidth: 0.8, borderColor: TTL.faint, borderStyle: solid, borderRadius: 1.5, marginRight: 4, alignItems: 'center', justifyContent: 'center' },
  boxOn:      { width: 8, height: 8, borderWidth: 0.8, borderColor: TTL.navy, borderStyle: solid, borderRadius: 1.5, marginRight: 4, backgroundColor: TTL.navy, alignItems: 'center', justifyContent: 'center' },
  boxMark:    { fontSize: 6, fontFamily: 'Helvetica-Bold', color: '#ffffff', marginTop: 0.5 },
  checkText:  { fontSize: 8, color: TTL.ink },
  small:      { fontSize: 6.5, color: TTL.muted, lineHeight: 1.35 },

  sigBox:     { borderWidth: 1, borderColor: '#bbf7d0', borderStyle: solid, backgroundColor: '#f0fdf4', borderRadius: 5, padding: 8, marginBottom: 9 },
  sigTitle:   { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#065f46', marginBottom: 3, letterSpacing: 0.6 },
  sigLine:    { fontSize: 8, color: '#047857', marginBottom: 1.5 },

  penRow:     { flexDirection: 'row', marginTop: 16 },
  penLine:    { flex: 1, borderTopWidth: 0.8, borderTopColor: TTL.ink, borderTopStyle: solid, paddingTop: 2, fontSize: 7, fontFamily: 'Helvetica-Bold', color: TTL.navy },
  penDate:    { width: '34%', marginLeft: 10, borderTopWidth: 0.8, borderTopColor: TTL.ink, borderTopStyle: solid, paddingTop: 2, fontSize: 7, fontFamily: 'Helvetica-Bold', color: TTL.navy },

  legal:      { borderTopWidth: 1, borderTopColor: RULE, borderTopStyle: solid, paddingTop: 6, marginTop: 1 },
  legalNote:  { fontSize: 7, fontFamily: 'Helvetica-Bold', color: TTL.navy, marginBottom: 3 },

  footer:     { position: 'absolute', bottom: 18, left: 34, right: 34, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: RULE, borderTopStyle: solid, paddingTop: 5 },
  footerTxt:  { fontSize: 6.5, color: TTL.faint },
});

const LOGO_PATH = path.join(process.cwd(), 'public', 'logo-circle.png');
let logoData: Buffer | null = null;
/** As bytes, not a path: react-pdf reads `C:\…` as a URL and draws nothing — see logoFull() in pdfBrand.ts. */
function logoCircle(): { data: Buffer; format: 'png' } {
  logoData ??= fs.readFileSync(LOGO_PATH);
  return { data: logoData, format: 'png' };
}

/** `half` is a card in a two-up row; a full-width card must not take `flex`, or it stretches down the page. */
function Card({ title, children, style, half = true }: { title: string; children: React.ReactNode; style?: Style; half?: boolean }) {
  return (
    <View style={[s.card, half ? { flex: 1 } : {}, style ?? {}]} wrap={false}>
      <View style={s.cardHead}>
        <View style={s.cardDot} />
        <Text style={s.cardTitle}>{title}</Text>
      </View>
      <View style={s.cardBody}>{children}</View>
    </View>
  );
}

/** A value, or a blank line to write on when there is none and `blank` is asked for. */
function Field({ label, value, full, blank }: { label: string; value: string; full?: boolean; blank?: boolean }) {
  return (
    <View style={full ? s.fieldFull : s.field}>
      <Text style={s.fLabel}>{label}</Text>
      {value || !blank ? <Text style={s.fValue}>{value || '—'}</Text> : <View style={s.fBlank} />}
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

function BolDocument({ d }: { d: BolData }) {
  // A multi-stop load says which line goes where, so the driver loads and
  // drops against the paper rather than from memory.
  const showRoute = d.items.some((it) => it.route);
  // Numbered once there is more than one of a kind, matching the stop table.
  const multiPickup  = d.extraStops.some((st) => st.label.startsWith('PICKUP'));
  const multiDeliver = d.extraStops.some((st) => st.label.startsWith('DELIVERY'));
  const originLine = [d.originCity, d.originState, d.originZip].filter(Boolean).join(', ');
  const destLine   = [d.destCity,   d.destState,   d.destZip  ].filter(Boolean).join(', ');

  // Column widths of the freight table, with or without the route column.
  const W = showRoute
    ? { hu: '10%', desc: '30%', pcs: '8%', dims: '17%', wt: '11%', hm: '6%', route: '18%' }
    : { hu: '11%', desc: '41%', pcs: '9%', dims: '20%', wt: '12%', hm: '7%', route: '0%' };

  return (
    <Document>
      <Page size="LETTER" style={s.page}>

        {/* Header */}
        <View style={s.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <PdfImage src={logoCircle()} style={{ width: 44, height: 44, marginRight: 11 }} />
            <View>
              <Text style={s.hLabel}>TOTAL TRANSPORT LOGISTICS</Text>
              <Text style={s.hTitle}>BILL OF LADING</Text>
              <Text style={s.hSub}>Straight Bill of Lading · Original – Not Negotiable</Text>
            </View>
          </View>
          <View style={s.hRight}>
            <Text style={s.hNumLabel}>BOL NO.</Text>
            <Text style={s.hNum}>{d.orderNumber}</Text>
            <Text style={s.hDate}>Date {d.generatedAt}</Text>
          </View>
        </View>
        <View style={s.accent} />

        {/* Ship from + Ship to — each company with its address and date, the
            way a dock reads it. On a multi-stop load these are the first
            pickup and delivery; the others are listed under the freight. */}
        <View style={s.row2}>
          <Card title={multiPickup ? 'SHIP FROM (PICKUP 1)' : 'SHIP FROM'}>
            <View style={s.fRow}>
              <Field label="Shipper" value={d.shipperName} full />
              <Field label="Address" value={[d.originStreet, originLine].filter(Boolean).join(', ')} full />
              <Field label="Phone" value={d.shipperPhone} />
              <Field label="Pickup date" value={d.pickupDate} />
              {d.originFreight ? <Field label="Load here" value={d.originFreight} full /> : null}
            </View>
          </Card>
          <View style={s.gap} />
          <Card title={multiDeliver ? 'SHIP TO (DELIVERY 1)' : 'SHIP TO'}>
            <View style={s.fRow}>
              <Field label="Consignee" value={d.consigneeName} full />
              <Field label="Address" value={[d.destStreet, destLine].filter(Boolean).join(', ')} full />
              <Field label="Phone" value={d.consigneePhone} />
              <Field label="Delivery date" value={d.deliveryDate} />
              {d.destFreight ? <Field label="Unload here" value={d.destFreight} full /> : null}
            </View>
          </Card>
        </View>

        {/* Client + Carrier */}
        <View style={s.row2}>
          <Card title="CLIENT">
            <Field label="Company" value={d.clientName} full />
          </Card>
          <View style={s.gap} />
          <Card title="CARRIER / DRIVER">
            <View style={s.fRow}>
              <Field label="Carrier" value={d.carrierName} full />
              {d.carrierDot ? <Field label="DOT #" value={d.carrierDot} /> : null}
              {d.carrierMc  ? <Field label="MC #"  value={d.carrierMc}  /> : null}
              <Field label="Driver" value={d.driverName} />
              <Field label="Driver phone" value={d.driverPhone} />
              <Field label="Truck No" value={d.truckNumber} blank />
              <Field label="Trailer No" value={d.trailerNumber} blank />
            </View>
          </Card>
        </View>

        {/* Freight — one row per item, so a mixed load is described piece by
            piece. The carrier signs against this table. */}
        <View style={s.table}>
          <View style={s.tHead}>
            <Text style={[s.th, { width: W.hu }]}>HANDLING UNITS</Text>
            <Text style={[s.th, { width: W.desc }]}>COMMODITY DESCRIPTION</Text>
            <Text style={[s.th, { width: W.pcs }]}>PIECES</Text>
            <Text style={[s.th, { width: W.dims }]}>DIMENSIONS (L × W × H)</Text>
            <Text style={[s.th, { width: W.wt }]}>WEIGHT</Text>
            <Text style={[s.th, { width: W.hm }]}>H.M.</Text>
            {showRoute && <Text style={[s.th, { width: W.route }]}>PICKED UP AT / DELIVERED TO</Text>}
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
              <Text style={[s.td, { width: W.pcs }]}>{it.quantity || '—'}</Text>
              <Text style={[s.td, { width: W.dims }]}>{it.dimensions || '—'}</Text>
              <Text style={[s.td, { width: W.wt }]}>{it.weight || '—'}</Text>
              <View style={[s.td, { width: W.hm }]}>
                {it.hazmat ? <Text style={s.hmTag}>X</Text> : <Text>—</Text>}
              </View>
              {showRoute && <Text style={[s.td, { width: W.route }]}>{it.route || '—'}</Text>}
            </View>
          ))}
          <View style={s.tRowTotal} wrap={false}>
            <Text style={[s.tdBold, { width: W.hu }]}> </Text>
            <Text style={[s.tdBold, { width: W.desc }]}>TOTAL</Text>
            <Text style={[s.tdBold, { width: W.pcs }]}>{d.pieces ? String(d.pieces) : '—'}</Text>
            <Text style={[s.tdBold, { width: W.dims }]}> </Text>
            <Text style={[s.tdBold, { width: W.wt }]}>{d.weight ? `${d.weight.toLocaleString()} lbs` : '—'}</Text>
            <Text style={[s.tdBold, { width: W.hm }]}> </Text>
            {showRoute && <Text style={[s.tdBold, { width: W.route }]}> </Text>}
          </View>
        </View>

        {/* The rest of the route, in the order it is driven — pickups, then deliveries. */}
        {d.extraStops.length > 0 && (
          <View style={s.table}>
            <View style={s.tHead}>
              <Text style={[s.th, { width: '16%' }]}>ADDITIONAL STOP</Text>
              <Text style={[s.th, { width: '26%' }]}>COMPANY</Text>
              <Text style={[s.th, { width: '26%' }]}>ADDRESS</Text>
              <Text style={[s.th, { width: '14%' }]}>DATE</Text>
              <Text style={[s.th, { width: '18%' }]}>FREIGHT</Text>
            </View>
            {d.extraStops.map((st, i) => (
              <View key={i} style={i % 2 ? s.tRowAlt : s.tRow} wrap={false}>
                <Text style={[s.tdBold, { width: '16%' }]}>{st.label}</Text>
                <Text style={[s.td, { width: '26%' }]}>{[st.company || '—', st.phone].filter(Boolean).join('\n')}</Text>
                <Text style={[s.td, { width: '26%' }]}>{[st.street, st.place].filter(Boolean).join('\n') || '—'}</Text>
                <Text style={[s.td, { width: '14%' }]}>{st.date || '—'}</Text>
                <Text style={[s.td, { width: '18%' }]}>{st.freight || '—'}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Freight charges + what happened at the dock */}
        <View style={s.row2}>
          <Card title="FREIGHT CHARGE TERMS">
            <Text style={[s.small, { marginBottom: 4 }]}>Prepaid unless marked otherwise.</Text>
            <View style={s.checkRow}>
              <Check on={d.freightChargeTerms === 'prepaid'} label="Prepaid" />
              <Check on={d.freightChargeTerms === 'collect'} label="Collect" />
              <Check on={d.freightChargeTerms === 'third_party'} label="3rd Party" />
            </View>
            <Field label="3rd party freight charges — bill to" value={d.thirdPartyBillTo} full blank />
            <Field label="Declared value (not exceeding)" value={d.declaredValue} full blank />
            <Text style={s.small}>
              Where the rate is dependent on value, shippers are required to state specifically in writing the agreed or declared value of the property. The carrier shall not make delivery of this shipment without payment of freight and all other lawful charges.
            </Text>
          </Card>
          <View style={s.gap} />
          <Card title="AT THE DOCK">
            <Text style={s.fLabel}>Trailer loaded</Text>
            <View style={s.checkRow}>
              <Check on={d.trailerLoadedBy === 'shipper'} label="By shipper" />
              <Check on={d.trailerLoadedBy === 'driver'} label="By driver" />
            </View>
            <Text style={s.fLabel}>Freight counted</Text>
            <View style={s.checkRow}>
              <Check on={d.freightCountedBy === 'shipper'} label="By shipper" />
              <Check on={d.freightCountedBy === 'driver_pallets'} label="By driver / pallets said to contain" />
              <Check on={d.freightCountedBy === 'driver_pieces'} label="By driver / pieces" />
            </View>
          </Card>
        </View>

        {/* Special instructions — the carrier's, never the internal notes. */}
        {d.carrierInstructions ? (
          <Card title="SPECIAL INSTRUCTIONS" half={false} style={{ marginBottom: 9 }}>
            <Text style={s.notesText}>{d.carrierInstructions}</Text>
          </Card>
        ) : null}

        {/* The carrier's e-signature of the Dispatch Sheet, as the BOL always showed it. */}
        {d.carrierSignerName ? (
          <View style={s.sigBox} wrap={false}>
            <Text style={s.sigTitle}>DISPATCH SHEET SIGNED ELECTRONICALLY BY THE CARRIER</Text>
            <Text style={s.sigLine}>Signed by: {d.carrierSignerName}</Text>
            {d.carrierSignedAt ? <Text style={s.sigLine}>Date: {d.carrierSignedAt}</Text> : null}
            {d.carrierSignerIp ? <Text style={s.sigLine}>IP Address: {d.carrierSignerIp}</Text> : null}
          </View>
        ) : null}

        {/* Signed at the dock, with a pen. */}
        <View style={s.row2} wrap={false}>
          <Card title="SHIPPER">
            <Text style={s.small}>
              This is to certify that the above named materials are properly classified, described, packaged, marked and labeled, and are in proper condition for transportation according to the applicable regulations of the DOT.
            </Text>
            <View style={s.penRow}>
              <Text style={s.penLine}>Shipper signature</Text>
              <Text style={s.penDate}>Date</Text>
            </View>
          </Card>
          <View style={s.gap} />
          <Card title="CARRIER">
            <Text style={s.small}>
              Carrier acknowledges receipt of packages and required placards. Carrier certifies emergency response information was made available and/or carrier has the DOT emergency response guidebook or equivalent documentation in the vehicle. Property described above is received in good order, except as noted.
            </Text>
            <View style={s.penRow}>
              <Text style={s.penLine}>Carrier signature</Text>
              <Text style={s.penDate}>Pickup date</Text>
            </View>
          </Card>
        </View>

        {/* The standard terms from the office's paper form. */}
        <View style={s.legal} wrap={false}>
          <Text style={s.legalNote}>NOTE: Liability limitation for loss or damage in this shipment may be applicable. See 49 U.S.C. § 14706(c)(1)(A) and (B).</Text>
          <Text style={s.small}>
            RECEIVED, subject to individually determined rates or contracts that have been agreed upon in writing between the carrier and shipper, if applicable, otherwise to the rates, classifications and rules that have been established by the carrier and are available to the shipper on request. The property described above, in apparent good order, except as noted (contents and condition of contents of packages unknown), marked, consigned, and destined as shown above, which said carrier agrees to carry to destination, if on its route, or otherwise deliver to another carrier on the route to destination. Every service to be performed hereunder shall be subject to all bill of lading terms and conditions in the governing classification on the date of shipment. Shipper hereby certifies that he is familiar with all the bill of lading terms and conditions in the governing classification and the said terms and conditions are hereby agreed to by the shipper and accepted for himself and his assigns.
          </Text>
        </View>

        {/* Footer, on every page. */}
        <View style={s.footer} fixed>
          <Text style={s.footerTxt}>Total Transport Logistics · totaltransportlogistics.us</Text>
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
