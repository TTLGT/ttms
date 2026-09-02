import React from 'react';
import path from 'path';
import { Document, Page, Text, View, StyleSheet, Image as PdfImage, renderToBuffer } from '@react-pdf/renderer';

export type InvoiceData = {
  invoiceNumber: string;
  invoiceDate: string;
  clientName: string;
  shipperName: string;
  consigneeName: string;
  commodity: string;
  pieces: number;
  weight: number;
  originCity: string;
  originState: string;
  destCity: string;
  destState: string;
  pickupDate: string;
  deliveryDate: string;
  agreedRate: number;
  notes: string;
  shipperSignerName: string | null;
  shipperSignedAt: string | null;
  shipperSignerIp: string | null;
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
  hInvNum:   { color: '#ffffff', fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
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
  tRowAlt:   { flexDirection: 'row', backgroundColor: LGRAY },
  tRowTotal: { flexDirection: 'row', backgroundColor: NAVY, borderRadius: 2 },
  th:        { flex: 1, padding: 6, fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#6b7280' },
  thWide:    { flex: 3, padding: 6, fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#6b7280' },
  td:        { flex: 1, padding: 6, fontSize: 9, color: '#111827' },
  tdWide:    { flex: 3, padding: 6, fontSize: 9, color: '#111827' },
  tdTotal:   { flex: 1, padding: 6, fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  tdTotalLbl:{ flex: 3, padding: 6, fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#ffffff' },

  notesBox:  { borderWidth: 1, borderColor: GRAY, borderStyle: 'solid', borderRadius: 3, padding: 8, marginBottom: 10 },
  notesText: { fontSize: 8, color: '#374151', lineHeight: 1.4 },

  sigBox:    { borderWidth: 1, borderColor: '#dbeafe', borderStyle: 'solid', backgroundColor: '#eff6ff', borderRadius: 3, padding: 8, marginBottom: 10 },
  sigTitle:  { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#1e40af', marginBottom: 4 },
  sigLine:   { fontSize: 8, color: '#1d4ed8', marginBottom: 2 },

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

function InvoiceDocument({ d }: { d: InvoiceData }) {
  const route = [d.originCity, d.originState].filter(Boolean).join(', ')
    + ' → '
    + [d.destCity, d.destState].filter(Boolean).join(', ');

  return (
    <Document>
      <Page size="LETTER" style={s.page}>

        {/* Header */}
        <View style={s.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <PdfImage src={LOGO_PATH} style={{ width: 46, height: 46, marginRight: 10 }} />
            <View>
              <Text style={s.hLabel}>TOTAL TRANSPORT LOGISTICS</Text>
              <Text style={s.hTitle}>INVOICE</Text>
            </View>
          </View>
          <View style={s.hRight}>
            <Text style={s.hInvNum}>{d.invoiceNumber}</Text>
            <Text style={s.hDate}>Invoice Date: {d.invoiceDate}</Text>
          </View>
        </View>

        {/* Bill To + From */}
        <View style={s.row2}>
          <View style={s.card}>
            <Text style={s.secTitle}>BILL TO</Text>
            <Field label="Company" value={d.clientName || d.shipperName} />
          </View>
          <View style={s.cardLast}>
            <Text style={s.secTitle}>FROM</Text>
            <Field label="Company"  value="Total Transport Logistics" />
            <Field label="Website"  value="totaltransportlogistics.us" />
          </View>
        </View>

        {/* Service details */}
        <View style={s.table}>
          <View style={s.tHead}>
            <Text style={s.thWide}>DESCRIPTION</Text>
            <Text style={s.th}>PICKUP DATE</Text>
            <Text style={s.th}>DELIVERY DATE</Text>
            <Text style={s.th}>PIECES</Text>
            <Text style={s.th}>WEIGHT</Text>
          </View>
          <View style={s.tRow}>
            <View style={s.tdWide}>
              <Text style={{ fontSize: 9, color: '#111827', padding: 6 }}>{d.commodity || 'Freight Service'}</Text>
              <Text style={{ fontSize: 7, color: '#6b7280', paddingLeft: 6, paddingBottom: 6 }}>{route}</Text>
            </View>
            <Text style={s.td}>{d.pickupDate}</Text>
            <Text style={s.td}>{d.deliveryDate}</Text>
            <Text style={s.td}>{d.pieces ? String(d.pieces) : '—'}</Text>
            <Text style={s.td}>{d.weight ? `${d.weight.toLocaleString()} lbs` : '—'}</Text>
          </View>
        </View>

        {/* Charges */}
        <View style={s.table}>
          <View style={s.tHead}>
            <Text style={s.thWide}>CHARGE</Text>
            <Text style={s.th}>AMOUNT</Text>
          </View>
          <View style={s.tRow}>
            <Text style={s.tdWide}>Freight Transportation</Text>
            <Text style={s.td}>{fmt(d.agreedRate)}</Text>
          </View>
          <View style={s.tRowTotal}>
            <Text style={s.tdTotalLbl}>TOTAL DUE</Text>
            <Text style={s.tdTotal}>{fmt(d.agreedRate)}</Text>
          </View>
        </View>

        {/* Notes */}
        {d.notes ? (
          <View style={s.notesBox}>
            <Text style={s.secTitle}>NOTES</Text>
            <Text style={s.notesText}>{d.notes}</Text>
          </View>
        ) : null}

        {/* Load confirmation signature */}
        {d.shipperSignerName ? (
          <View style={s.sigBox}>
            <Text style={s.sigTitle}>LOAD CONFIRMATION — SHIPPER SIGNATURE</Text>
            <Text style={s.sigLine}>Signed by: {d.shipperSignerName}</Text>
            {d.shipperSignedAt ? <Text style={s.sigLine}>Date: {d.shipperSignedAt}</Text> : null}
            {d.shipperSignerIp ? <Text style={s.sigLine}>IP Address: {d.shipperSignerIp}</Text> : null}
          </View>
        ) : null}

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerTxt}>Total Transport Logistics · totaltransportlogistics.us</Text>
          <Text style={s.footerTxt}>Generated {d.generatedAt}</Text>
        </View>

      </Page>
    </Document>
  );
}

export async function generateInvoiceBuffer(d: InvoiceData): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToBuffer(React.createElement(InvoiceDocument, { d }) as any) as Promise<Buffer>;
}
