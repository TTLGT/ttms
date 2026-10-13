import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image as PdfImage, Link, renderToBuffer } from '@react-pdf/renderer';
import { COMPANY, TTL, logoFull, logoFullBox } from './pdfBrand';

/**
 * The quote a broker hands a client before anything is signed: the lane, the
 * freight, the dates and the price, from the order as it stands.
 *
 * It leaves the company, so it follows the BOL's rules rather than the
 * screen's: dates spelled out ("March 4, 2020") because a slashed date is two
 * different days depending on who reads it, the public site rather than the
 * staff tool in the footer, and nothing of ours on it — no carrier pay, no
 * broker fee. Everything is pre-formatted by the route, as BolData is.
 *
 * Same letterhead and colours as the client's load confirmation
 * (src/lib/pdfBrand.ts), since the two travel in the same email.
 */

export type QuoteFreightLine = {
  description: string;
  quantity: string;
  dimensions: string;
  weight: string;
  /** Present only on a vehicle line — see confirmationFreight(). */
  vehicle?: string;
  vin?: string;
};

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
   * A picture of the load as a JPEG data URL, or null — see clientPhotoId()
   * for which picture a client may be shown.
   */
  photo?: string | null;
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

const ON_NAVY = '#aab8f0';

const s = StyleSheet.create({
  page:      { paddingTop: 28, paddingHorizontal: 36, paddingBottom: 54, fontSize: 9, fontFamily: 'Helvetica', color: TTL.ink, backgroundColor: '#ffffff' },
  letter:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  coName:    { fontSize: 10, fontFamily: 'Helvetica-Bold', color: TTL.navy, textAlign: 'right', marginBottom: 2 },
  coLine:    { fontSize: 8, color: TTL.muted, textAlign: 'right', lineHeight: 1.35 },
  titleBar:  { backgroundColor: TTL.navy, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  kicker:    { color: ON_NAVY, fontSize: 7.5, fontFamily: 'Helvetica-Bold', letterSpacing: 1.2, marginBottom: 3 },
  title:     { color: '#ffffff', fontSize: 18, fontFamily: 'Helvetica-Bold', letterSpacing: 0.4 },
  orderLbl:  { color: ON_NAVY, fontSize: 7.5, fontFamily: 'Helvetica-Bold', letterSpacing: 1.2, textAlign: 'right', marginBottom: 2 },
  orderNum:  { color: '#ffffff', fontSize: 15, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  issued:    { color: ON_NAVY, fontSize: 8, textAlign: 'right', marginTop: 2 },
  redRule:   { height: 3, backgroundColor: TTL.redBright, marginBottom: 12 },

  row:       { flexDirection: 'row', marginBottom: 10 },
  gap:       { width: 10 },
  // A panel sharing a row; on its own a panel must not grow, or it fills the page.
  col:       { flex: 1 },
  panel:     { borderWidth: 1, borderColor: TTL.rule, borderStyle: 'solid', borderRadius: 4 },
  panelHead: { backgroundColor: TTL.wash, paddingVertical: 5, paddingHorizontal: 8, borderTopLeftRadius: 4, borderTopRightRadius: 4, flexDirection: 'row', alignItems: 'center' },
  headMark:  { width: 3, height: 9, backgroundColor: TTL.redBright, marginRight: 6 },
  headText:  { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: TTL.navy, letterSpacing: 0.9 },
  panelBody: { paddingVertical: 7, paddingHorizontal: 8 },
  label:     { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: TTL.faint, letterSpacing: 0.7, marginBottom: 2 },
  value:     { fontSize: 9, color: TTL.ink, marginBottom: 5 },
  big:       { fontSize: 11, fontFamily: 'Helvetica-Bold', color: TTL.ink, marginBottom: 3 },
  stopTag:   { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#ffffff', borderRadius: 2, paddingVertical: 1.5, paddingHorizontal: 4, marginRight: 5 },
  stopName:  { fontSize: 9, fontFamily: 'Helvetica-Bold', color: TTL.ink, flex: 1 },
  stopDate:  { fontSize: 8, color: TTL.blue, fontFamily: 'Helvetica-Bold', marginTop: 1, marginBottom: 5 },
  photo:     { width: '100%', height: 104, objectFit: 'cover', borderRadius: 3 },

  strip:     { flexDirection: 'row', borderWidth: 1, borderColor: TTL.rule, borderStyle: 'solid', borderRadius: 4, marginBottom: 10 },
  stripCell: { flex: 1, paddingVertical: 6, paddingHorizontal: 8, borderLeftWidth: 1, borderLeftColor: TTL.rule, borderLeftStyle: 'solid' },
  stripFirst:{ flex: 1, paddingVertical: 6, paddingHorizontal: 8 },

  tHead:     { flexDirection: 'row', backgroundColor: '#f6f7fc', borderBottomWidth: 1, borderBottomColor: TTL.rule, borderBottomStyle: 'solid' },
  tRow:      { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#e8ebf3', borderTopStyle: 'solid' },
  th:        { padding: 5, fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: TTL.navy, letterSpacing: 0.7 },
  td:        { padding: 5, fontSize: 8.5, color: TTL.ink },
  sub:       { fontSize: 7.5, color: TTL.muted, marginTop: 1 },
  vin:       { fontSize: 7.5, fontFamily: 'Courier-Bold', color: TTL.navy, marginTop: 1 },
  cDesc:     { flex: 3.2 },
  cQty:      { flex: 0.6 },
  cDim:      { flex: 1.5 },
  cWt:       { flex: 1.1, textAlign: 'right' },

  priceBox:  { backgroundColor: TTL.navy, borderRadius: 4, paddingVertical: 9, paddingHorizontal: 14, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderLeftWidth: 5, borderLeftColor: TTL.redBright, borderLeftStyle: 'solid' },
  priceLbl:  { fontSize: 8, color: ON_NAVY, fontFamily: 'Helvetica-Bold', letterSpacing: 1 },
  priceVal:  { fontSize: 22, color: '#ffffff', fontFamily: 'Helvetica-Bold' },
  needBox:   { borderWidth: 1, borderColor: '#fde68a', borderStyle: 'solid', backgroundColor: '#fffbeb', borderRadius: 4, padding: 8, marginBottom: 10 },
  needTtl:   { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#92400e', marginBottom: 4 },
  needLine:  { fontSize: 8, color: '#92400e', marginBottom: 2 },
  qrBox:     { borderWidth: 1.5, borderColor: TTL.navy, borderStyle: 'solid', borderRadius: 4, padding: 8, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  qrTitle:   { fontSize: 9, fontFamily: 'Helvetica-Bold', color: TTL.navy, marginBottom: 3 },
  qrText:    { fontSize: 8, color: TTL.muted, lineHeight: 1.4 },
  terms:     { fontSize: 7.5, color: TTL.muted, lineHeight: 1.4, marginBottom: 10 },
  footer:    { position: 'absolute', left: 36, right: 36, bottom: 22, borderTopWidth: 1.5, borderTopColor: TTL.redBright, borderTopStyle: 'solid', paddingTop: 5, flexDirection: 'row', justifyContent: 'space-between' },
  footTxt:   { fontSize: 6.5, color: TTL.faint },
});

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

// A Style, without importing @react-pdf/types, which is not a direct dependency.
type PanelStyle = Extract<React.ComponentProps<typeof View>['style'], { flex?: unknown }>;

function Panel({ title, children, style }: { title: string; children: React.ReactNode; style?: PanelStyle }) {
  return (
    <View style={style ? [s.panel, style] : s.panel}>
      <View style={s.panelHead}>
        <View style={s.headMark} />
        <Text style={s.headText}>{title}</Text>
      </View>
      <View style={s.panelBody}>{children}</View>
    </View>
  );
}

function Stops({ title, stops, prefix, color, stacked }: {
  title: string; stops: { place: string; date: string }[]; prefix: string; color: string;
  /** Under the other side rather than beside it — where flex would collapse it to nothing. */
  stacked: boolean;
}) {
  return (
    <View style={stacked ? { marginBottom: 2 } : { flex: 1 }}>
      <Text style={[s.label, { marginBottom: 4 }]}>{title}</Text>
      {(stops.length ? stops : [{ place: '', date: '' }]).map((st, i) => (
        <View key={i} wrap={false}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[s.stopTag, { backgroundColor: color }]}>{prefix}{stops.length > 1 ? i + 1 : ''}</Text>
            <Text style={s.stopName}>{st.place || 'To be confirmed'}</Text>
          </View>
          <Text style={s.stopDate}>{st.date || 'Date to be confirmed'}</Text>
        </View>
      ))}
    </View>
  );
}

function QuoteDocument({ d }: { d: QuoteData }) {
  const facts = [
    { label: 'Distance', value: d.miles },
    { label: 'Transport type', value: d.equipment },
    { label: 'Total weight', value: d.totalWeight },
  ].filter((x) => x.value);

  return (
    <Document title={`Quote ${d.orderNumber}`} author={COMPANY.legalName}>
      <Page size="LETTER" style={s.page}>
        <View style={s.letter}>
          <PdfImage src={logoFull()} style={logoFullBox(50)} />
          <View>
            <Text style={s.coName}>{COMPANY.legalName}</Text>
            <Text style={s.coLine}>{COMPANY.street}</Text>
            <Text style={s.coLine}>{COMPANY.city}</Text>
            <Text style={s.coLine}>Phone: {COMPANY.phone}</Text>
            <Text style={s.coLine}>{COMPANY.web}</Text>
          </View>
        </View>

        <View style={s.titleBar}>
          <View>
            <Text style={s.kicker}>TOTAL TRANSPORT LOGISTICS</Text>
            <Text style={s.title}>FREIGHT QUOTE</Text>
          </View>
          <View>
            <Text style={s.orderLbl}>ORDER #</Text>
            <Text style={s.orderNum}>{d.orderNumber}</Text>
            <Text style={s.issued}>Issued {d.issuedOn}</Text>
          </View>
        </View>
        <View style={s.redRule} />

        <View style={s.row} wrap={false}>
          <Panel title="PREPARED FOR" style={s.col}>
            <Text style={s.big}>{d.clientName || '—'}</Text>
            {d.contactName ? <Text style={s.value}>Attn: {d.contactName}</Text> : null}
          </Panel>
          <View style={s.gap} />
          <Panel title="PREPARED BY" style={s.col}>
            <Text style={s.big}>{d.preparedBy || COMPANY.legalName}</Text>
            {d.preparedByEmail ? <Text style={s.value}>{d.preparedByEmail}</Text> : null}
          </Panel>
        </View>

        <View style={s.row} wrap={false}>
          <Panel title="SHIPMENT" style={s.col}>
            {/* With a picture beside it there is no room for two columns, so the stops stack. */}
            <View style={{ flexDirection: d.photo ? 'column' : 'row' }}>
              <Stops title={d.pickups.length > 1 ? 'PICKUPS' : 'PICKUP'} stops={d.pickups} prefix="P" color={TTL.navy} stacked={Boolean(d.photo)} />
              {d.photo ? null : <View style={s.gap} />}
              <Stops title={d.deliveries.length > 1 ? 'DELIVERIES' : 'DELIVERY'} stops={d.deliveries} prefix="D" color={TTL.red} stacked={Boolean(d.photo)} />
            </View>
          </Panel>
          {d.photo ? <View style={s.gap} /> : null}
          {d.photo ? (
            <Panel title="LOAD PICTURE" style={{ width: 200 }}>
              <PdfImage src={d.photo} style={s.photo} />
            </Panel>
          ) : null}
        </View>

        {facts.length > 0 && (
          <View style={s.strip}>
            {facts.map((x, i) => (
              <View key={x.label} style={i === 0 ? s.stripFirst : s.stripCell}>
                <Text style={s.label}>{x.label.toUpperCase()}</Text>
                <Text style={{ fontSize: 9 }}>{x.value}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={[s.panel, { marginBottom: 10 }]} wrap={false}>
          <View style={s.panelHead}>
            <View style={s.headMark} />
            <Text style={s.headText}>{d.items.some((x) => x.vehicle || x.vin) ? 'VEHICLES AND FREIGHT' : 'FREIGHT'}</Text>
          </View>
          <View style={s.tHead}>
            <Text style={[s.th, s.cDesc]}>DESCRIPTION</Text>
            <Text style={[s.th, s.cQty]}>QTY</Text>
            <Text style={[s.th, s.cDim]}>DIMENSIONS</Text>
            <Text style={[s.th, s.cWt]}>WEIGHT</Text>
          </View>
          {d.items.map((it, i) => (
            <View key={i} style={i === 0 ? { flexDirection: 'row' } : s.tRow}>
              <View style={[s.td, s.cDesc]}>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>{it.description || it.vehicle || '—'}</Text>
                {it.vehicle && it.description ? <Text style={s.sub}>{it.vehicle}</Text> : null}
                {it.vin ? <Text style={s.vin}>VIN {it.vin}</Text> : null}
              </View>
              <Text style={[s.td, s.cQty]}>{it.quantity || '—'}</Text>
              <Text style={[s.td, s.cDim]}>{it.dimensions || '—'}</Text>
              <Text style={[s.td, s.cWt]}>{it.weight || '—'}</Text>
            </View>
          ))}
        </View>

        <View style={s.priceBox} wrap={false}>
          <Text style={s.priceLbl}>QUOTED PRICE (USD)</Text>
          <Text style={s.priceVal}>{d.price > 0 ? money(d.price) : 'To be confirmed'}</Text>
        </View>

        {d.notes ? (
          <Panel title="NOTES" style={{ marginBottom: 10 }}>
            <Text style={{ fontSize: 8.5, lineHeight: 1.4 }}>{d.notes}</Text>
          </Panel>
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
                <Link src={d.signLink} style={{ ...s.qrText, color: TTL.blue, marginTop: 3 }}>
                  Open the load confirmation
                </Link>
              ) : null}
            </View>
          </View>
        ) : null}

        {d.stillNeeded.length > 0 && (
          <View style={s.needBox} wrap={false}>
            <Text style={s.needTtl}>To confirm this load we still need:</Text>
            {d.stillNeeded.map((n, i) => <Text key={i} style={s.needLine}>• {n}</Text>)}
          </View>
        )}

        <Text style={s.terms}>
          This is a quote, not a booking. The load is confirmed once you sign the load confirmation we send for
          electronic signature. The price assumes the freight, dates and addresses shown; changes to any of them,
          and accessorial charges such as detention, layover or lumper fees, may change it.
        </Text>

        <View style={s.footer} fixed>
          <Text style={s.footTxt}>{COMPANY.legalName} · {COMPANY.phone} · {COMPANY.web}</Text>
          <Text style={s.footTxt} render={({ pageNumber, totalPages }) => `Quote ${d.orderNumber} · Page ${pageNumber} of ${totalPages}`} />
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
