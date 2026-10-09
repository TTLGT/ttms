import React from 'react';
import path from 'path';
import { Document, Page, Text, View, StyleSheet, Image as PdfImage, Link, renderToBuffer } from '@react-pdf/renderer';

/**
 * The quote a broker hands a client before anything is signed: the lane, the
 * freight, the dates and the price, from the order as it stands.
 *
 * It leaves the company, so it follows the BOL's rules rather than the
 * screen's: dates spelled out ("March 4, 2020") because a slashed date is two
 * different days depending on who reads it, the public site rather than the
 * staff tool in the footer, and nothing of ours on it — no carrier pay, no
 * broker fee. Everything is pre-formatted by the route, as BolData is.
 */

export type QuoteFreightLine = { description: string; quantity: string; dimensions: string; weight: string };

export type QuoteData = {
  orderNumber: string;
  issuedOn: string;
  clientName: string;
  contactName: string;
  pickups: { place: string; date: string }[];
  deliveries: { place: string; date: string }[];
  miles: string;
  equipment: string;
  items: QuoteFreightLine[];
  totalWeight: string;
  price: number;
  notes: string;
  preparedBy: string;
  preparedByEmail: string;
  /** What the client still has to give us before an SA can go out. Empty when nothing. */
  stillNeeded: string[];
  /**
   * The QR code for the load confirmation's signing page, as a PNG data URL —
   * only on the copy attached to that email, so a client who prints the quote
   * can still get to the agreement. The Quote button's download has no link to
   * give and leaves it out.
   */
  signQr?: string;
  /**
   * The signing page the QR code points at. The code and the line beside it
   * are links to it as well, so somebody reading the PDF on the phone the
   * code would have to be scanned with can tap it instead.
   */
  signLink?: string;
};

const NAVY = '#1e3a5f';
const GRAY = '#e5e7eb';
const LGRAY = '#f9fafb';

const s = StyleSheet.create({
  page:     { padding: 36, fontSize: 9, fontFamily: 'Helvetica', color: '#111827', backgroundColor: '#ffffff' },
  header:   { backgroundColor: NAVY, padding: 14, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 3 },
  hLabel:   { color: '#93c5fd', fontSize: 7, marginBottom: 3 },
  hTitle:   { color: '#ffffff', fontSize: 18, fontFamily: 'Helvetica-Bold' },
  hNum:     { color: '#ffffff', fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 2, textAlign: 'right' },
  hDate:    { color: '#d1d5db', fontSize: 8, textAlign: 'right' },
  secTitle: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#6b7280', marginBottom: 5, borderBottomWidth: 1, borderBottomColor: GRAY, borderBottomStyle: 'solid', paddingBottom: 3 },
  row2:     { flexDirection: 'row', marginBottom: 12 },
  card:     { flex: 1, borderWidth: 1, borderColor: GRAY, borderStyle: 'solid', borderRadius: 3, padding: 8, marginRight: 8 },
  cardLast: { flex: 1, borderWidth: 1, borderColor: GRAY, borderStyle: 'solid', borderRadius: 3, padding: 8 },
  fLabel:   { fontSize: 7, color: '#9ca3af', marginBottom: 1 },
  fValue:   { fontSize: 9, color: '#111827', marginBottom: 4 },
  table:    { borderWidth: 1, borderColor: GRAY, borderStyle: 'solid', borderRadius: 3, marginBottom: 12 },
  tHead:    { flexDirection: 'row', backgroundColor: LGRAY, borderBottomWidth: 1, borderBottomColor: GRAY, borderBottomStyle: 'solid' },
  tRow:     { flexDirection: 'row', borderTopWidth: 1, borderTopColor: GRAY, borderTopStyle: 'solid' },
  th:       { flex: 1, padding: 6, fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#6b7280' },
  thWide:   { flex: 2, padding: 6, fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#6b7280' },
  td:       { flex: 1, padding: 6, fontSize: 9 },
  tdWide:   { flex: 2, padding: 6, fontSize: 9 },
  priceBox: { borderWidth: 2, borderColor: NAVY, borderStyle: 'solid', borderRadius: 4, padding: 12, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceLbl: { fontSize: 9, color: '#374151', fontFamily: 'Helvetica-Bold' },
  priceVal: { fontSize: 20, color: NAVY, fontFamily: 'Helvetica-Bold' },
  needBox:  { borderWidth: 1, borderColor: '#fde68a', borderStyle: 'solid', backgroundColor: '#fffbeb', borderRadius: 3, padding: 8, marginBottom: 12 },
  needTtl:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#92400e', marginBottom: 4 },
  needLine: { fontSize: 8, color: '#92400e', marginBottom: 2 },
  qrBox:    { borderWidth: 1, borderColor: GRAY, borderStyle: 'solid', borderRadius: 3, padding: 8, marginBottom: 12, flexDirection: 'row', alignItems: 'center' },
  qrTitle:  { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 3 },
  qrText:   { fontSize: 8, color: '#4b5563', lineHeight: 1.4 },
  terms:    { fontSize: 7.5, color: '#4b5563', lineHeight: 1.4, marginBottom: 12 },
  footer:   { borderTopWidth: 1, borderTopColor: GRAY, borderTopStyle: 'solid', paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
  footTxt:  { fontSize: 7, color: '#9ca3af' },
});

const LOGO_PATH = path.join(process.cwd(), 'public', 'logo-circle.png');

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={s.fLabel}>{label}</Text>
      <Text style={s.fValue}>{value || '—'}</Text>
    </View>
  );
}

function Stops({ title, stops }: { title: string; stops: { place: string; date: string }[] }) {
  return (
    <>
      <Text style={s.secTitle}>{title}</Text>
      {stops.length === 0 ? <Text style={s.fValue}>To be confirmed</Text> : stops.map((st, i) => (
        <View key={i}>
          <Text style={s.fValue}>{stops.length > 1 ? `${i + 1}. ` : ''}{st.place || 'To be confirmed'}</Text>
          {st.date ? <Text style={{ ...s.fLabel, marginBottom: 4 }}>{st.date}</Text> : null}
        </View>
      ))}
    </>
  );
}

function QuoteDocument({ d }: { d: QuoteData }) {
  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <PdfImage src={LOGO_PATH} style={{ width: 46, height: 46, marginRight: 10 }} />
            <View>
              <Text style={s.hLabel}>TOTAL TRANSPORT LOGISTICS</Text>
              <Text style={s.hTitle}>FREIGHT QUOTE</Text>
            </View>
          </View>
          <View>
            <Text style={s.hNum}>{d.orderNumber}</Text>
            <Text style={s.hDate}>Issued {d.issuedOn}</Text>
          </View>
        </View>

        <View style={s.row2}>
          <View style={s.card}>
            <Field label="PREPARED FOR" value={d.clientName} />
            {d.contactName ? <Field label="ATTENTION" value={d.contactName} /> : null}
          </View>
          <View style={s.cardLast}>
            <Field label="PREPARED BY" value={d.preparedBy} />
            {d.preparedByEmail ? <Field label="EMAIL" value={d.preparedByEmail} /> : null}
          </View>
        </View>

        <View style={s.row2}>
          <View style={s.card}><Stops title="PICKUP" stops={d.pickups} /></View>
          <View style={s.cardLast}><Stops title="DELIVERY" stops={d.deliveries} /></View>
        </View>

        <View style={s.row2}>
          <View style={s.card}><Field label="DISTANCE" value={d.miles} /></View>
          <View style={s.card}><Field label="EQUIPMENT" value={d.equipment} /></View>
          <View style={s.cardLast}><Field label="TOTAL WEIGHT" value={d.totalWeight} /></View>
        </View>

        <Text style={s.secTitle}>FREIGHT</Text>
        <View style={s.table}>
          <View style={s.tHead}>
            <Text style={s.thWide}>DESCRIPTION</Text>
            <Text style={s.th}>QTY</Text>
            <Text style={s.th}>DIMENSIONS</Text>
            <Text style={s.th}>WEIGHT</Text>
          </View>
          {d.items.map((it, i) => (
            <View key={i} style={s.tRow}>
              <Text style={s.tdWide}>{it.description || '—'}</Text>
              <Text style={s.td}>{it.quantity || '—'}</Text>
              <Text style={s.td}>{it.dimensions || '—'}</Text>
              <Text style={s.td}>{it.weight || '—'}</Text>
            </View>
          ))}
        </View>

        <View style={s.priceBox}>
          <Text style={s.priceLbl}>QUOTED PRICE (USD)</Text>
          <Text style={s.priceVal}>{d.price > 0 ? money(d.price) : 'To be confirmed'}</Text>
        </View>

        {d.notes ? (
          <>
            <Text style={s.secTitle}>NOTES</Text>
            <Text style={{ ...s.terms, color: '#111827', fontSize: 8.5 }}>{d.notes}</Text>
          </>
        ) : null}

        {d.signQr ? (
          <View style={s.qrBox} wrap={false}>
            {d.signLink ? (
              <Link src={d.signLink} style={{ marginRight: 12 }}>
                <PdfImage src={d.signQr} style={{ width: 72, height: 72 }} />
              </Link>
            ) : (
              <PdfImage src={d.signQr} style={{ width: 72, height: 72, marginRight: 12 }} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={s.qrTitle}>Scan or tap to review and sign the load confirmation</Text>
              <Text style={s.qrText}>
                The same link as the button in our email. It shows the rate, the pickup and delivery details, the
                payment terms and our terms and conditions, and lets you sign electronically.
              </Text>
              {d.signLink ? (
                <Link src={d.signLink} style={{ ...s.qrText, color: '#2563eb', marginTop: 3 }}>
                  Open the load confirmation
                </Link>
              ) : null}
            </View>
          </View>
        ) : null}

        {d.stillNeeded.length > 0 && (
          <View style={s.needBox}>
            <Text style={s.needTtl}>To confirm this load we still need:</Text>
            {d.stillNeeded.map((n, i) => <Text key={i} style={s.needLine}>• {n}</Text>)}
          </View>
        )}

        <Text style={s.terms}>
          This is a quote, not a booking. The load is confirmed once you sign the load confirmation we send for
          electronic signature. The price assumes the freight, dates and addresses shown; changes to any of them,
          and accessorial charges such as detention, layover or lumper fees, may change it.
        </Text>

        <View style={s.footer}>
          <Text style={s.footTxt}>Total Transport Logistics · totaltransportlogistics.us</Text>
          <Text style={s.footTxt}>{d.orderNumber}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function generateQuoteBuffer(d: QuoteData): Promise<Buffer> {
  // Same cast as the BOL: renderToBuffer wants DocumentProps, and QuoteDocument renders one.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToBuffer(React.createElement(QuoteDocument, { d }) as any) as Promise<Buffer>;
}
