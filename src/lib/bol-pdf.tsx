import React from 'react';
import path from 'path';
import { Document, Page, Text, View, StyleSheet, Image as PdfImage, renderToBuffer } from '@react-pdf/renderer';

/**
 * One freight line as it prints. Pre-formatted by the route so this module
 * stays free of domain logic and unit conversion, as the rest of BolData is.
 */
export type BolCommodityLine = {
  description: string;
  quantity: string;
  dimensions: string;
  weight: string;
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
  agreedRate: number;
  brokerFee: number;
  carrierPay: number;
  notes: string;
  carrierSignerName: string | null;
  carrierSignedAt: string | null;
  carrierSignerIp: string | null;
  generatedAt: string;
};

const NAVY  = '#1e3a5f';
const GRAY  = '#e5e7eb';
const LGRAY = '#f9fafb';

const s = StyleSheet.create({
  page:      { padding: 36, fontSize: 9, fontFamily: 'Helvetica', color: '#111827', backgroundColor: '#ffffff' },

  header:    { backgroundColor: NAVY, padding: 14, marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderRadius: 3 },
  hLabel:    { color: '#93c5fd', fontSize: 7, marginBottom: 3 },
  hTitle:    { color: '#ffffff', fontSize: 18, fontFamily: 'Helvetica-Bold' },
  hRight:    { alignItems: 'flex-end' },
  hBolNum:   { color: '#ffffff', fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  hDate:     { color: '#d1d5db', fontSize: 8 },

  secTitle:  { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#6b7280', marginBottom: 5, borderBottomWidth: 1, borderBottomColor: GRAY, borderBottomStyle: 'solid', paddingBottom: 3 },

  row2:      { flexDirection: 'row', marginBottom: 10 },
  card:      { flex: 1, borderWidth: 1, borderColor: GRAY, borderStyle: 'solid', borderRadius: 3, padding: 8, marginRight: 8 },
  cardLast:  { flex: 1, borderWidth: 1, borderColor: GRAY, borderStyle: 'solid', borderRadius: 3, padding: 8 },

  fLabel:    { fontSize: 7, color: '#9ca3af', marginBottom: 1 },
  fValue:    { fontSize: 9, color: '#111827', marginBottom: 4 },

  table:     { borderWidth: 1, borderColor: GRAY, borderStyle: 'solid', borderRadius: 3, marginBottom: 10 },
  tHead:     { flexDirection: 'row', backgroundColor: LGRAY, borderBottomWidth: 1, borderBottomColor: GRAY, borderBottomStyle: 'solid' },
  tRow:      { flexDirection: 'row' },
  tRowDivided: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: GRAY, borderTopStyle: 'solid' },
  tRowTotal: { flexDirection: 'row', backgroundColor: LGRAY, borderTopWidth: 1, borderTopColor: GRAY, borderTopStyle: 'solid' },
  th:        { flex: 1, padding: 6, fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#6b7280' },
  thWide:    { flex: 2, padding: 6, fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#6b7280' },
  td:        { flex: 1, padding: 6, fontSize: 9, color: '#111827' },
  tdWide:    { flex: 2, padding: 6, fontSize: 9, color: '#111827' },
  tdBold:    { flex: 1, padding: 6, fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#111827' },

  notesBox:  { borderWidth: 1, borderColor: GRAY, borderStyle: 'solid', borderRadius: 3, padding: 8, marginBottom: 10 },
  notesText: { fontSize: 8, color: '#374151', lineHeight: 1.4 },

  sigBox:    { borderWidth: 1, borderColor: '#d1fae5', borderStyle: 'solid', backgroundColor: '#f0fdf4', borderRadius: 3, padding: 8, marginBottom: 10 },
  sigTitle:  { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#065f46', marginBottom: 4 },
  sigLine:   { fontSize: 8, color: '#047857', marginBottom: 2 },

  footer:    { borderTopWidth: 1, borderTopColor: GRAY, borderTopStyle: 'solid', paddingTop: 8, marginTop: 4, flexDirection: 'row', justifyContent: 'space-between' },
  footerTxt: { fontSize: 7, color: '#9ca3af' },
});

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={s.fLabel}>{label}</Text>
      <Text style={s.fValue}>{value || '—'}</Text>
    </View>
  );
}

function fmt(n: number) {
  return n ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n) : '—';
}

const LOGO_PATH = path.join(process.cwd(), 'public', 'logo-circle.png');

function BolDocument({ d }: { d: BolData }) {
  const originLine = [d.originCity, d.originState, d.originZip].filter(Boolean).join(', ');
  const destLine   = [d.destCity,   d.destState,   d.destZip  ].filter(Boolean).join(', ');

  return (
    <Document>
      <Page size="LETTER" style={s.page}>

        {/* Header */}
        <View style={s.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <PdfImage src={LOGO_PATH} style={{ width: 46, height: 46, marginRight: 10 }} />
            <View>
              <Text style={s.hLabel}>TOTAL TRANSPORT LOGISTICS</Text>
              <Text style={s.hTitle}>BILL OF LADING</Text>
            </View>
          </View>
          <View style={s.hRight}>
            <Text style={s.hBolNum}>{d.orderNumber}</Text>
            <Text style={s.hDate}>Generated {d.generatedAt}</Text>
          </View>
        </View>

        {/* Shipper + Consignee */}
        <View style={s.row2}>
          <View style={s.card}>
            <Text style={s.secTitle}>SHIPPER (ORIGIN)</Text>
            <Field label="Company" value={d.shipperName} />
            {d.shipperPhone ? <Field label="Phone" value={d.shipperPhone} /> : null}
          </View>
          <View style={s.cardLast}>
            <Text style={s.secTitle}>CONSIGNEE (DESTINATION)</Text>
            <Field label="Company" value={d.consigneeName} />
            {d.consigneePhone ? <Field label="Phone" value={d.consigneePhone} /> : null}
          </View>
        </View>

        {/* Client + Carrier */}
        <View style={s.row2}>
          <View style={s.card}>
            <Text style={s.secTitle}>CLIENT (BILL TO)</Text>
            <Field label="Company" value={d.clientName} />
          </View>
          <View style={s.cardLast}>
            <Text style={s.secTitle}>CARRIER / DRIVER</Text>
            <Field label="Carrier" value={d.carrierName} />
            {d.carrierDot ? <Field label="DOT #" value={d.carrierDot} /> : null}
            {d.carrierMc  ? <Field label="MC #"  value={d.carrierMc}  /> : null}
            <Field label="Driver"        value={d.driverName} />
            {d.driverPhone ? <Field label="Driver Phone" value={d.driverPhone} /> : null}
          </View>
        </View>

{/* Commodity — one row per item, so a mixed load is described piece by
            piece. The carrier signs against this table. */}
        <View style={s.table}>
          <View style={s.tHead}>
            <Text style={s.thWide}>COMMODITY</Text>
            <Text style={s.th}>PIECES</Text>
            <Text style={s.thWide}>DIMENSIONS (L × W × H)</Text>
            <Text style={s.th}>WEIGHT</Text>
          </View>
          {d.items.map((it, i) => (
            <View key={i} style={i === 0 ? s.tRow : s.tRowDivided}>
              <Text style={s.tdWide}>{it.description || '—'}</Text>
              <Text style={s.td}>{it.quantity || '—'}</Text>
              <Text style={s.tdWide}>{it.dimensions || '—'}</Text>
              <Text style={s.td}>{it.weight || '—'}</Text>
            </View>
          ))}
          {d.items.length > 1 && (
            <View style={s.tRowTotal}>
              <Text style={s.tdWide}>TOTAL</Text>
              <Text style={s.td}>{d.pieces ? String(d.pieces) : '—'}</Text>
              <Text style={s.tdWide}> </Text>
              <Text style={s.td}>{d.weight ? `${d.weight.toLocaleString()} lbs` : '—'}</Text>
            </View>
          )}
        </View>

        {/* Origin + Destination */}
        <View style={s.row2}>
          <View style={s.card}>
            <Text style={s.secTitle}>ORIGIN (PICKUP)</Text>
            <Field label="Date"    value={d.pickupDate} />
            {d.originStreet ? <Field label="Address" value={d.originStreet} /> : null}
            <Field label="City / State / Zip" value={originLine} />
          </View>
          <View style={s.cardLast}>
            <Text style={s.secTitle}>DESTINATION (DELIVERY)</Text>
            <Field label="Date"    value={d.deliveryDate} />
            {d.destStreet ? <Field label="Address" value={d.destStreet} /> : null}
            <Field label="City / State / Zip" value={destLine} />
          </View>
        </View>

        {/* Financials */}
        <View style={s.table}>
          <View style={s.tHead}>
            <Text style={s.th}>AGREED RATE</Text>
            <Text style={s.th}>CARRIER PAY</Text>
            <Text style={s.th}>BROKER FEE</Text>
          </View>
          <View style={s.tRow}>
            <Text style={s.tdBold}>{fmt(d.agreedRate)}</Text>
            <Text style={s.tdBold}>{fmt(d.carrierPay)}</Text>
            <Text style={s.td}>{fmt(d.brokerFee)}</Text>
          </View>
        </View>

        {/* Notes */}
        {d.notes ? (
          <View style={s.notesBox}>
            <Text style={s.secTitle}>NOTES</Text>
            <Text style={s.notesText}>{d.notes}</Text>
          </View>
        ) : null}

        {/* Carrier signature */}
        {d.carrierSignerName ? (
          <View style={s.sigBox}>
            <Text style={s.sigTitle}>CARRIER SIGNATURE</Text>
            <Text style={s.sigLine}>Signed by: {d.carrierSignerName}</Text>
            {d.carrierSignedAt ? <Text style={s.sigLine}>Date: {d.carrierSignedAt}</Text> : null}
            {d.carrierSignerIp ? <Text style={s.sigLine}>IP Address: {d.carrierSignerIp}</Text> : null}
          </View>
        ) : null}

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerTxt}>Total Transport Logistics · tms.totaltransportlogistics.us</Text>
          <Text style={s.footerTxt}>This document serves as the official Bill of Lading</Text>
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
