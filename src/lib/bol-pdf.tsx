import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image as PdfImage, renderToBuffer } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import { TTL, logoFull, logoFullBox } from './pdfBrand';

/**
 * One freight line as it prints. Pre-formatted by the caller so this module
 * stays free of domain logic and unit conversion, as the rest of BolData is.
 */
export type BolCommodityLine = {
  description: string;
  quantity: string;
  dimensions: string;
  /** "36,000" — pounds, without the unit, which the column heading carries. */
  weight: string;
  /**
   * "Pickup 1 to Delivery 2" — words, because the built-in Helvetica cannot
   * draw an arrow. '' on a load with one pickup and one delivery, where it
   * could only say the obvious; a dash stands in for a side nobody set.
   */
  route: string;
  /** "2019 Toyota Camry · Silver · Sedan · Operable", or '' when not a vehicle. */
  vehicle: string;
  /** '' when none was entered. */
  vin: string;
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
   * a multi-stop load — '' otherwise.
   */
  originFreight: string;
  destFreight: string;
  /*
   * No money, on purpose (2026-10-14). The BOL used to print the agreed rate,
   * carrier pay and broker fee — our whole margin — on a document that is
   * handed to the driver and emailed to the shipper, consignee, carrier and
   * client (see src/lib/bolRequests.ts). What anybody pays is on the
   * agreements, each to its own party; never put it back here.
   *
   * No carrier e-signature either. The old BOL printed the carrier's
   * signature of the Dispatch Sheet, which is a different document: the
   * signatures that belong on a BOL are the shipper's and the driver's at the
   * dock, so those are blank lines for a pen.
   */
  /** Special instructions for the carrier. The order's internal notes are never printed. */
  carrierInstructions: string;
  generatedAt: string;
};

const LINE  = '#9ca3af';
const SHADE = '#e5e7eb';

/*
 * The layout is the Straight Bill of Lading the office already used (sent
 * over 2026-10-14), so a dock that knows that form finds everything where it
 * expects it. Every box draws only its right and bottom edges, inside a frame
 * that draws the top and left, so neighbouring boxes never double a line.
 */
const edge = { borderColor: LINE, borderStyle: 'solid' as const };
const rule = { borderBottomWidth: 0.8, borderBottomColor: TTL.ink, borderBottomStyle: 'solid' as const };

const s = StyleSheet.create({
  page:      { paddingVertical: 28, paddingHorizontal: 32, fontSize: 8, fontFamily: 'Helvetica', color: TTL.ink, backgroundColor: '#ffffff' },
  top:       { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 6 },
  title:     { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  subtitle:  { fontSize: 7.5, color: TTL.muted, marginBottom: 3 },
  dateBox:   { ...edge, borderWidth: 1, paddingVertical: 4, paddingHorizontal: 5, fontSize: 9, fontFamily: 'Helvetica-Bold' },

  frame:     { ...edge, borderTopWidth: 1, borderLeftWidth: 1 },
  row:       { flexDirection: 'row' },
  half:      { width: '50%' },
  cell:      { ...edge, borderRightWidth: 1, borderBottomWidth: 1, paddingVertical: 3, paddingHorizontal: 4 },
  label:     { fontSize: 7.5, fontFamily: 'Helvetica-Bold' },
  party:     { textAlign: 'center', fontSize: 9, lineHeight: 1.3, paddingVertical: 4 },
  kv:        { flexDirection: 'row', alignItems: 'center' },
  kvLabel:   { width: 72, fontSize: 7.5, fontFamily: 'Helvetica-Bold' },
  kvValue:   { flex: 1, fontSize: 9 },
  bolNo:     { textAlign: 'center', fontSize: 11, paddingVertical: 5 },
  instr:     { backgroundColor: TTL.wash, minHeight: 92, paddingVertical: 4, paddingHorizontal: 5, fontSize: 8, lineHeight: 1.35 },
  instrHead: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: TTL.navy, marginTop: 3 },

  box:       { width: 7, height: 7, ...edge, borderWidth: 0.8, marginRight: 4 },
  check:     { flexDirection: 'row', alignItems: 'center', marginRight: 12, fontSize: 7.5 },

  th:        { fontSize: 7, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  thSmall:   { fontSize: 5.5, textAlign: 'center', lineHeight: 1.2 },
  td:        { fontSize: 8, textAlign: 'center' },
  tdLeft:    { fontSize: 8 },
  tdSub:     { fontSize: 7, color: TTL.muted, marginTop: 1 },
  tdVin:     { fontSize: 7, fontFamily: 'Helvetica-Bold', marginTop: 1 },
  shade:     { backgroundColor: SHADE },

  small:     { fontSize: 6.5, lineHeight: 1.3 },
  sigLine:   { borderTopWidth: 0.8, borderTopColor: TTL.ink, borderTopStyle: 'solid', paddingTop: 2, fontSize: 7.5, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
});

/** Column widths of the commodity table. They add up to 100%. */
const COL = {
  huQty: '6%', huType: '6%', pkQty: '6%', pkType: '6%', weight: '9%', hm: '6%',
  desc: '45%', nmfc: '9%', cls: '7%',
} as const;

/** Enough rows that the page reads as the familiar form; more when the load has more lines. */
const MIN_ROWS = 10;

function Box({ label }: { label: string }) {
  return (
    <View style={s.check}>
      <View style={s.box} />
      <Text>{label}</Text>
    </View>
  );
}

function Cell({ w, style, children }: { w: string; style?: Style; children?: React.ReactNode }) {
  return <View style={[s.cell, { width: w }, style ?? {}]}>{children}</View>;
}

function BolDocument({ d }: { d: BolData }) {
  const originPlace = `${[d.originCity, d.originState].filter(Boolean).join(' ')} ${d.originZip}`.trim();
  const destPlace   = `${[d.destCity, d.destState].filter(Boolean).join(' ')} ${d.destZip}`.trim();
  const blanks = Math.max(0, MIN_ROWS - d.items.length);
  const dates = [d.pickupDate && `Pickup: ${d.pickupDate}`, d.deliveryDate && `Delivery: ${d.deliveryDate}`]
    .filter(Boolean).join('   ·   ');

  return (
    <Document>
      <Page size="LETTER" style={s.page}>

        <View style={s.top}>
          <View style={{ width: '50%' }}>
            <PdfImage src={logoFull()} style={logoFullBox(46)} />
          </View>
          <View style={{ width: '50%' }}>
            <Text style={s.title}>Straight Bill of Lading</Text>
            <Text style={s.subtitle}>Original – Not Negotiable</Text>
            <Text style={s.dateBox}>Date: {d.generatedAt}</Text>
          </View>
        </View>

        <View style={s.frame}>
          <View style={s.row}>
            {/* Left: where it comes from, where it goes, who pays. */}
            <View style={s.half}>
              <View style={[s.cell, { minHeight: 62 }]}>
                <Text style={s.label}>Ship From:</Text>
                <Text style={s.party}>
                  {[d.shipperName, d.originStreet, originPlace, d.shipperPhone].filter(Boolean).join('\n') || ' '}
                </Text>
              </View>
              <View style={[s.cell, s.kv]}>
                <Text style={[s.label, { flex: 1 }]}>SID#:</Text>
                <Box label="FOB" />
              </View>
              <View style={[s.cell, { minHeight: 62 }]}>
                <Text style={s.label}>Ship To</Text>
                <Text style={s.party}>
                  {[d.consigneeName, d.destStreet, destPlace, d.consigneePhone].filter(Boolean).join('\n') || ' '}
                </Text>
              </View>
              <View style={[s.cell, s.kv]}>
                <Text style={[s.label, { flex: 1 }]}>CID#:</Text>
                <Box label="FOB" />
              </View>
              <View style={s.cell}>
                <Text style={s.label}>Freight Charge Terms (prepaid unless marked otherwise)</Text>
                <View style={[s.row, { marginTop: 3, paddingLeft: 20 }]}>
                  <Box label="Prepaid" />
                  <Box label="Collect" />
                  <Box label="3rd Party" />
                </View>
              </View>
              <View style={[s.cell, { minHeight: 54, flexGrow: 1 }]}>
                <Text style={s.label}>3rd Pty Freight Charges - Bill To:</Text>
              </View>
            </View>

            {/* Right: the load's number, the truck, and the instructions. */}
            <View style={s.half}>
              <View style={s.cell}>
                <Text style={s.label}>Bill of Lading No:</Text>
                <Text style={s.bolNo}>{d.orderNumber}</Text>
              </View>
              <View style={s.cell}>
                <View style={s.kv}><Text style={s.kvLabel}>Carrier Name:</Text><Text style={s.kvValue}>{d.carrierName}</Text></View>
                {d.carrierDot || d.carrierMc ? (
                  <View style={s.kv}>
                    <Text style={s.kvLabel}>DOT / MC:</Text>
                    <Text style={s.kvValue}>{[d.carrierDot && `DOT ${d.carrierDot}`, d.carrierMc && `MC ${d.carrierMc}`].filter(Boolean).join(' · ')}</Text>
                  </View>
                ) : null}
                <View style={s.kv}>
                  <Text style={s.kvLabel}>Driver Name:</Text>
                  <Text style={s.kvValue}>{[d.driverName, d.driverPhone].filter(Boolean).join(' · ')}</Text>
                </View>
              </View>
              <View style={s.cell}><Text style={s.label}>Truck & trailer No</Text></View>
              <View style={s.cell}><Text style={s.label}>SCAC:</Text></View>
              <View style={[s.cell, { minHeight: 22 }]}><Text style={s.label}>Seal Number(s):</Text></View>
              <View style={[s.cell, s.kv]}>
                <Text style={[s.label, { flex: 1 }]}>Special Instructions:</Text>
                <Box label="Master BOL" />
              </View>
              {/* The dates, the other stops on a multi-stop load, and the
                  carrier's instructions — never the order's internal notes. */}
              <View style={[s.cell, s.instr, { flexGrow: 1 }]}>
                {dates ? <Text>{dates}</Text> : null}
                {d.originFreight ? <Text>Load at Ship From: {d.originFreight}</Text> : null}
                {d.destFreight ? <Text>Unload at Ship To: {d.destFreight}</Text> : null}
                {d.extraStops.length > 0 ? <Text style={s.instrHead}>ADDITIONAL STOPS</Text> : null}
                {d.extraStops.map((st, i) => (
                  <Text key={i}>
                    {st.label}: {[st.company, st.street, st.place, st.phone].filter(Boolean).join(', ')}
                    {st.date ? ` — ${st.date}` : ''}{st.freight ? ` — ${st.freight}` : ''}
                  </Text>
                ))}
                {d.carrierInstructions && (dates || d.extraStops.length > 0)
                  ? <Text style={s.instrHead}>INSTRUCTIONS</Text> : null}
                {d.carrierInstructions ? <Text>{d.carrierInstructions}</Text> : null}
              </View>
            </View>
          </View>

          {/* Commodity table — the office's form, column for column. */}
          <View style={s.row}>
            <Cell w="12%"><Text style={s.th}>Handling Unit</Text></Cell>
            <Cell w="12%"><Text style={s.th}>Package</Text></Cell>
            <Cell w="15%"><Text style={s.th}> </Text></Cell>
            <Cell w="45%"><Text style={s.th}>Commodity Description</Text></Cell>
            <Cell w="16%"><Text style={s.th}>LTL Only</Text></Cell>
          </View>
          <View style={s.row}>
            <Cell w={COL.huQty}><Text style={s.th}>QTY</Text></Cell>
            <Cell w={COL.huType}><Text style={s.th}>TYPE</Text></Cell>
            <Cell w={COL.pkQty}><Text style={s.th}>QTY</Text></Cell>
            <Cell w={COL.pkType}><Text style={s.th}>TYPE</Text></Cell>
            <Cell w={COL.weight}><Text style={s.th}>Weight (lbs)</Text></Cell>
            <Cell w={COL.hm}><Text style={s.th}>H.M. (X)</Text></Cell>
            <Cell w={COL.desc}>
              <Text style={s.thSmall}>Commodities requiring special or additional care or attention in handling or stowing must be so marked and packaged as to ensure safe transportation with ordinary care.</Text>
              <Text style={[s.thSmall, { fontFamily: 'Helvetica-Bold' }]}>See Section 2(e) of NMFC Item 360</Text>
            </Cell>
            <Cell w={COL.nmfc}><Text style={s.th}>NMFC No.</Text></Cell>
            <Cell w={COL.cls}><Text style={s.th}>Class</Text></Cell>
          </View>
          {d.items.map((it, i) => (
            <View key={i} style={s.row} wrap={false}>
              <Cell w={COL.huQty} />
              <Cell w={COL.huType} />
              <Cell w={COL.pkQty}><Text style={s.td}>{it.quantity}</Text></Cell>
              <Cell w={COL.pkType} />
              <Cell w={COL.weight}><Text style={s.td}>{it.weight}</Text></Cell>
              <Cell w={COL.hm} />
              {/* The vehicle under its line, and the VIN in bold: it is what
                  the driver checks at pickup and what a claim is written against. */}
              <Cell w={COL.desc}>
                <Text style={s.tdLeft}>{(it.description || '—').toUpperCase()}</Text>
                {it.dimensions ? <Text style={s.tdSub}>{it.dimensions}</Text> : null}
                {it.vehicle ? <Text style={s.tdSub}>{it.vehicle}</Text> : null}
                {it.vin ? <Text style={s.tdVin}>VIN: {it.vin}</Text> : null}
                {it.route ? <Text style={s.tdSub}>{it.route}</Text> : null}
              </Cell>
              <Cell w={COL.nmfc} />
              <Cell w={COL.cls} />
            </View>
          ))}
          {Array.from({ length: blanks }, (_, i) => (
            <View key={`blank-${i}`} style={s.row}>
              {Object.values(COL).map((w, j) => <Cell key={j} w={w} style={{ height: 13 }} />)}
            </View>
          ))}
          <View style={s.row}>
            <Cell w={COL.huQty} style={s.shade} />
            <Cell w={COL.huType} style={s.shade} />
            <Cell w={COL.pkQty}><Text style={s.td}>{d.pieces ? String(d.pieces) : ''}</Text></Cell>
            <Cell w={COL.pkType} style={s.shade} />
            <Cell w={COL.weight}><Text style={s.td}>{d.weight ? d.weight.toLocaleString() : ''}</Text></Cell>
            <Cell w={COL.hm} style={s.shade} />
            <Cell w={COL.desc}><Text style={s.label}>Totals:</Text></Cell>
            <Cell w={COL.nmfc} style={s.shade} />
            <Cell w={COL.cls} style={s.shade} />
          </View>

          {/* Declared value, and payment before delivery. */}
          <View style={s.row}>
            <Cell w="50%" style={{ minHeight: 62 }}>
              <Text style={s.small}>Where the rate is dependent on value, shippers are required to state specifically in writing the agreed or declared value of the property as follows:</Text>
              <Text style={[s.small, { marginTop: 6 }]}>The agreed or declared value of the property is specifically stated by the shipper to be not exceeding</Text>
              <View style={[s.row, { marginTop: 14, alignItems: 'flex-end' }]}>
                <View style={[{ width: '40%' }, rule]} />
                <Text style={[s.small, { marginHorizontal: 4 }]}>FOB.</Text>
                <View style={[{ width: '40%' }, rule]} />
              </View>
            </Cell>
            <Cell w="50%" style={{ minHeight: 62 }}>
              <Text style={s.small}>The carrier shall not make delivery of this shipment without payment of freight and all other lawful charges.</Text>
              <View style={[s.row, { marginTop: 18, alignItems: 'flex-end' }]}>
                <Text style={[s.label, { width: '35%', textAlign: 'center' }]}>Shipper Signature</Text>
                <View style={[{ width: '60%' }, rule]} />
              </View>
            </Cell>
          </View>

          <View style={s.row}>
            <Cell w="100%">
              <Text style={s.label}>NOTE: Liability Limitation for loss or damage in this shipment may be applicable. See 49 U.S.C. - 14706(c)(1)(A) and (B).</Text>
            </Cell>
          </View>
          <View style={s.row}>
            <Cell w="100%">
              <Text style={s.small}>
                RECEIVED, subject to individually determined rates or contracts that have been agreed upon in writing between the carrier and shipper, if applicable, otherwise to the rates, classifications and rules that have been established by the carrier and are available to the shipper on request. The property described above, in apparent good order, except as noted (contents and condition of contents of packages unknown), marked, consigned, and destined as shown above, which said carrier agrees to carry to destination, if on its route, or otherwise deliver to another carrier on the route to destination. Every service to be performed hereunder shall be subject to all bill of lading terms and conditions in the governing classification on the date of shipment. Shipper hereby certifies that he is familiar with all the bill of lading terms and conditions in the governing classification and the said terms and conditions are hereby agreed to by the shipper and accepted for himself and his assigns.
              </Text>
            </Cell>
          </View>

          {/* The signatures that happen at the dock, with a pen. */}
          <View style={s.row}>
            <Cell w="38%" style={{ minHeight: 80, justifyContent: 'space-between' }}>
              <Text style={s.small}>This is to certify that the above named materials are properly classified, described, packaged, marked and labeled, and are in proper condition for transportation according to the applicable regulations of the DOT.</Text>
              <View style={[s.row, { marginTop: 18 }]}>
                <Text style={[s.sigLine, { width: '55%' }]}>Shipper Signature</Text>
                <Text style={[s.label, { marginLeft: 12, paddingTop: 2 }]}>Date</Text>
              </View>
            </Cell>
            <Cell w="24%" style={{ minHeight: 80 }}>
              <View style={s.row}>
                <View style={{ width: '45%' }}>
                  <Text style={[s.label, { marginBottom: 3 }]}>Trailer Load</Text>
                  <Box label="By Shipper" />
                  <View style={{ height: 4 }} />
                  <Box label="By Driver" />
                </View>
                <View style={{ width: '55%' }}>
                  <Text style={[s.label, { marginBottom: 3 }]}>Freight Counted</Text>
                  <Box label="By Shipper" />
                  <View style={{ height: 4 }} />
                  <Box label="By Driver/ Pallet said to contain" />
                  <View style={{ height: 4 }} />
                  <Box label="By Driver/ Pieces" />
                </View>
              </View>
            </Cell>
            <Cell w="38%" style={{ minHeight: 80, justifyContent: 'space-between' }}>
              <Text style={s.small}>Carrier acknowledges receipt of packages and required placards. Carrier certifies emergency response information was made available and/or carrier has the DOT emergency response guidebook or equivalent documentation in the vehicle. Property described above is received in good order, except as noted.</Text>
              <View style={[s.row, { marginTop: 10 }]}>
                <Text style={[s.sigLine, { width: '55%' }]}>Carrier Signature</Text>
                <Text style={[s.label, { marginLeft: 12, paddingTop: 2 }]}>Pick up Date</Text>
              </View>
            </Cell>
          </View>
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
