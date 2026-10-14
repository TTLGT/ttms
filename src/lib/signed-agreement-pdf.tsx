import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image as PdfImage, Link, renderToBuffer } from '@react-pdf/renderer';
import { COMPANY, TTL, logoFull, logoFullBox } from './pdfBrand';
import type { SignFormData } from './signFormProps';

/**
 * A signing link's agreement as a PDF — signed, or a plain copy of a version
 * that never was: the client's Shipper Agreement (load confirmation) or the
 * carrier's Carrier Agreement (rate confirmation), told apart by `form.type`.
 *
 * Drawn from the same `SignFormData` the signing page shows (signFormData()
 * over the link's stored copy), so the PDF says exactly what the client read
 * and signed, never what the order says today. Nothing here reads the order.
 *
 * It leaves the company, so dates are spelled out ("March 4, 2020") like the
 * BOL and the agreement emails, and times carry their zone.
 *
 * Laid out after the Shipper Agreement BATS produced — letterhead, client,
 * price, shipment, vehicles, a signature certificate with a QR code and a
 * fingerprint, then the terms — in TTL's own navy and red (src/lib/pdfBrand.ts).
 * The client's copy also carries a picture of the load when the link was sent
 * with one (`photoId`, chosen by clientPhotoId()); the carrier's never does.
 */

export interface AgreementSignature {
  name: string;
  title: string;
  /** "October 9, 2026 at 3:14 PM UTC" */
  at: string;
  ip: string;
  device: string;
  esignConsent: boolean;
  termsAccepted: boolean;
  /** SHA-256, base64 — see signatureFingerprint() in src/lib/signedAgreements.ts. */
  fingerprint: string;
}

export interface SignedAgreementData {
  form: SignFormData;
  /** Null for a version that was sent and never signed. */
  signature: AgreementSignature | null;
  /** Who the link was emailed to. */
  sentTo: string;
  /**
   * Why this version no longer counts — "Replaced by a later version on
   * October 9, 2026" — or '' while it is in force. Non-empty stamps VOID
   * across every page. See voidNoteFor() in src/lib/signedAgreements.ts.
   */
  voidNote: string;
  generatedAt: string;
  /** The load's picture as a JPEG data URL. Client copies only; null when there is none. */
  photo?: string | null;
  /** QR code (PNG data URL) for the signing link. Signed copies only. */
  qr?: string | null;
  /** The signing link the QR code opens — where the signer can download this copy again. */
  link?: string;
}

/** A signature time as it prints: spelled-out date, 12-hour time, in UTC. */
export function signatureTime(d: Date): string {
  const date = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  return `${date} at ${time} UTC`;
}

/** Pale navy for small capitals on a navy ground. */
const ON_NAVY = '#aab8f0';

const s = StyleSheet.create({
  page:      { paddingTop: 28, paddingHorizontal: 36, paddingBottom: 54, fontSize: 9, fontFamily: 'Helvetica', color: TTL.ink, backgroundColor: '#ffffff' },

  // Letterhead
  letter:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  coName:    { fontSize: 10, fontFamily: 'Helvetica-Bold', color: TTL.navy, textAlign: 'right', marginBottom: 2 },
  coLine:    { fontSize: 8, color: TTL.muted, textAlign: 'right', lineHeight: 1.35 },
  titleBar:  { backgroundColor: TTL.navy, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  kicker:    { color: ON_NAVY, fontSize: 7.5, fontFamily: 'Helvetica-Bold', letterSpacing: 1.2, marginBottom: 3 },
  title:     { color: '#ffffff', fontSize: 17, fontFamily: 'Helvetica-Bold', letterSpacing: 0.4 },
  orderLbl:  { color: ON_NAVY, fontSize: 7.5, fontFamily: 'Helvetica-Bold', letterSpacing: 1.2, textAlign: 'right', marginBottom: 2 },
  orderNum:  { color: '#ffffff', fontSize: 15, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  redRule:   { height: 3, backgroundColor: TTL.redBright, marginBottom: 10 },
  pill:      { marginTop: 4, alignSelf: 'flex-end', backgroundColor: '#ffffff', borderRadius: 8, paddingVertical: 2, paddingHorizontal: 7, fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 0.6 },

  // Facts strip under the title
  strip:     { flexDirection: 'row', borderWidth: 1, borderColor: TTL.rule, borderStyle: 'solid', borderRadius: 4, marginBottom: 10 },
  stripCell: { flex: 1, paddingVertical: 6, paddingHorizontal: 8, borderLeftWidth: 1, borderLeftColor: TTL.rule, borderLeftStyle: 'solid' },
  stripFirst:{ flex: 1, paddingVertical: 6, paddingHorizontal: 8 },
  label:     { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: TTL.faint, letterSpacing: 0.7, marginBottom: 2 },
  value:     { fontSize: 9, color: TTL.ink },

  // Panels
  row:       { flexDirection: 'row', marginBottom: 10 },
  panel:     { borderWidth: 1, borderColor: TTL.rule, borderStyle: 'solid', borderRadius: 4 },
  gap:       { width: 10 },
  // A panel sharing a row; on its own a panel must not grow, or it fills the page.
  col:       { flex: 1 },
  panelHead: { backgroundColor: TTL.wash, paddingVertical: 5, paddingHorizontal: 8, borderTopLeftRadius: 4, borderTopRightRadius: 4, flexDirection: 'row', alignItems: 'center' },
  headMark:  { width: 3, height: 9, backgroundColor: TTL.redBright, marginRight: 6 },
  headText:  { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: TTL.navy, letterSpacing: 0.9 },
  panelBody: { paddingVertical: 7, paddingHorizontal: 8 },
  partyName: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: TTL.ink, marginBottom: 3 },
  line:      { fontSize: 8.5, color: '#374151', lineHeight: 1.4 },
  field:     { marginBottom: 5 },

  // Price
  priceBand: { backgroundColor: TTL.navy, paddingVertical: 8, paddingHorizontal: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceLbl:  { color: ON_NAVY, fontSize: 7.5, fontFamily: 'Helvetica-Bold', letterSpacing: 1 },
  priceVal:  { color: '#ffffff', fontSize: 18, fontFamily: 'Helvetica-Bold' },
  partRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },

  // Stops
  stop:      { marginBottom: 6 },
  stopHead:  { flexDirection: 'row', alignItems: 'center', marginBottom: 1 },
  stopTag:   { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#ffffff', borderRadius: 2, paddingVertical: 1.5, paddingHorizontal: 4, marginRight: 5 },
  stopName:  { fontSize: 9, fontFamily: 'Helvetica-Bold', color: TTL.ink, flex: 1 },
  stopDate:  { fontSize: 8, color: TTL.blue, fontFamily: 'Helvetica-Bold', marginTop: 1 },
  photo:     { width: '100%', height: 132, objectFit: 'cover', borderRadius: 3 },

  // Freight table
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
  totalRow:  { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: TTL.rule, borderTopStyle: 'solid', backgroundColor: '#fafbfe', paddingVertical: 5, paddingHorizontal: 5 },

  // Signature certificate
  cert:      { borderWidth: 1.5, borderColor: TTL.navy, borderStyle: 'solid', borderRadius: 4, marginBottom: 10 },
  certHead:  { backgroundColor: TTL.navy, paddingVertical: 6, paddingHorizontal: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  certTitle: { color: '#ffffff', fontSize: 9, fontFamily: 'Helvetica-Bold', letterSpacing: 1.2 },
  certBadge: { color: '#ffffff', backgroundColor: '#15803d', fontSize: 7, fontFamily: 'Helvetica-Bold', borderRadius: 7, paddingVertical: 2, paddingHorizontal: 7, letterSpacing: 0.6 },
  consent:   { fontSize: 7.5, fontFamily: 'Helvetica-Oblique', color: TTL.muted, lineHeight: 1.4, paddingHorizontal: 10, paddingTop: 7 },
  certBody:  { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 8 },
  sigName:   { fontSize: 22, fontFamily: 'Times-Italic', color: TTL.navy, paddingBottom: 2, borderBottomWidth: 1, borderBottomColor: TTL.faint, borderBottomStyle: 'solid', marginBottom: 6 },
  kv:        { flexDirection: 'row', marginBottom: 2.5 },
  k:         { width: 92, fontSize: 7.5, fontFamily: 'Courier-Bold', color: TTL.ink },
  v:         { flex: 1, fontSize: 7.5, fontFamily: 'Courier', color: TTL.ink },
  qrWrap:    { width: 160, flexDirection: 'row', alignItems: 'center', marginLeft: 12 },
  qrText:    { flex: 1, fontSize: 7, color: TTL.muted, lineHeight: 1.35, marginLeft: 6 },
  esignNote: { fontSize: 6.5, color: TTL.faint, paddingHorizontal: 10, paddingBottom: 6 },
  printBar:  { flexDirection: 'row', backgroundColor: '#e5e7eb', borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  printLbl:  { width: 140, paddingVertical: 5, paddingHorizontal: 10, fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: TTL.navy },
  printVal:  { flex: 1, paddingVertical: 5, paddingHorizontal: 8, fontSize: 7.5, fontFamily: 'Courier', color: TTL.ink, backgroundColor: '#d1d5db', borderBottomRightRadius: 3 },

  terms:     { fontSize: 7.5, color: '#374151', lineHeight: 1.45 },
  banner:    { borderWidth: 1, borderStyle: 'solid', borderRadius: 4, padding: 8, marginBottom: 10 },

  footer:    { position: 'absolute', left: 36, right: 36, bottom: 22, borderTopWidth: 1.5, borderTopColor: TTL.redBright, borderTopStyle: 'solid', paddingTop: 5, flexDirection: 'row', justifyContent: 'space-between' },
  footTxt:   { fontSize: 6.5, color: TTL.faint },

  // The VOID stamp: the whole page, so it sits over the middle of every page
  // whatever its length. Red at low opacity, so the agreement underneath stays
  // readable as a record of what was sent — it is void, not erased.
  voidLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  voidMark:  { fontSize: 150, fontFamily: 'Helvetica-Bold', color: '#dc2626', opacity: 0.16, transform: 'rotate(-35deg)', letterSpacing: 12 },
  voidBox:   { borderWidth: 1.5, borderColor: '#dc2626', borderStyle: 'solid', backgroundColor: '#fef2f2', borderRadius: 4, padding: 8, marginBottom: 10 },
  voidHead:  { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#b91c1c', marginBottom: 2 },
  voidTxt:   { fontSize: 8, color: '#991b1b' },
});

function PanelHead({ title }: { title: string }) {
  return (
    <View style={s.panelHead}>
      <View style={s.headMark} />
      <Text style={s.headText}>{title}</Text>
    </View>
  );
}

// A Style, without importing @react-pdf/types, which is not a direct dependency.
type PanelStyle = Extract<React.ComponentProps<typeof View>['style'], { flex?: unknown }>;

function Panel({ title, children, style }: { title: string; children: React.ReactNode; style?: PanelStyle }) {
  return (
    <View style={style ? [s.panel, style] : s.panel}>
      <PanelHead title={title} />
      <View style={s.panelBody}>{children}</View>
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label.toUpperCase()}</Text>
      <Text style={s.value}>{value || '—'}</Text>
    </View>
  );
}

type Stop = NonNullable<SignFormData['stops']>[number];

function StopBlock({ stop, tag, color }: { stop: Stop; tag: string; color: string }) {
  const head = stop.name || stop.street || stop.place || 'Address to be confirmed';
  const lines = [stop.street, stop.place].filter((l) => l && l !== head);
  return (
    <View style={s.stop} wrap={false}>
      <View style={s.stopHead}>
        <Text style={[s.stopTag, { backgroundColor: color }]}>{tag}</Text>
        <Text style={s.stopName}>{head}</Text>
      </View>
      {lines.map((l) => <Text key={l} style={s.line}>{l}</Text>)}
      <Text style={s.stopDate}>{stop.dates || 'Date to be confirmed'}</Text>
    </View>
  );
}

/**
 * One side of the trip. A link sent before stops were itemised has only the
 * one-line lane and date, which is drawn as a single stop.
 */
function StopColumn({ title, stops, prefix, color, lane, date, stacked }: {
  title: string; stops: Stop[]; prefix: string; color: string; lane: string; date: string;
  /** Under the other side rather than beside it — where flex would collapse it to nothing. */
  stacked: boolean;
}) {
  const fallback: Stop = { kind: 'pickup', name: '', street: '', place: lane === '—' ? '' : lane, dates: date === '—' ? '' : date };
  return (
    <View style={stacked ? { marginBottom: 2 } : { flex: 1 }}>
      <Text style={[s.label, { marginBottom: 4 }]}>{title}</Text>
      {stops.length > 0
        ? stops.map((st, i) => <StopBlock key={i} stop={st} tag={`${prefix}${stops.length > 1 ? i + 1 : ''}`} color={color} />)
        : <StopBlock stop={fallback} tag={prefix} color={color} />}
    </View>
  );
}

function AgreementDocument({ d }: { d: SignedAgreementData }) {
  const f = d.form;
  const pickups = (f.stops ?? []).filter((x) => x.kind === 'pickup');
  const deliveries = (f.stops ?? []).filter((x) => x.kind === 'delivery');
  const sig = d.signature;
  // The carrier's copy names the carrier and the driver and quotes carrier
  // pay; it never shows the client's rate, which is our margin's other half,
  // nor anything about the client.
  const carrier = f.type === 'carrier_agreement';
  const kicker = carrier ? 'RATE CONFIRMATION' : 'SHIPPER AGREEMENT (SA)';
  const docTitle = carrier ? 'DISPATCH SHEET' : 'CLIENT LOAD CONFIRMATION';
  const docName = carrier ? 'Dispatch Sheet' : 'Shipper Agreement';
  const photo = !carrier && d.photo ? d.photo : null;

  const status = d.voidNote
    ? { text: 'VOID', color: '#b91c1c' }
    : sig ? { text: 'SIGNED', color: '#15803d' } : { text: 'NOT SIGNED', color: '#b45309' };

  // Only what we hold: a link sent before a field was copied onto it leaves
  // that cell out rather than printing a dash where BATS printed a value.
  const facts = [
    { label: 'Order date', value: f.orderDate },
    { label: carrier ? 'Pickup date' : 'First available pickup', value: carrier ? f.pickupDate : f.firstAvailablePickup },
    { label: 'Transport type', value: f.equipment },
    { label: 'Version', value: f.version ? String(f.version) : '' },
    { label: carrier ? 'Dispatcher' : 'Your contact', value: f.sentByName },
  ].filter((x): x is { label: string; value: string } => Boolean(x.value && x.value !== '—'));

  const freight = f.freight && f.freight.length > 0
    ? f.freight
    : [{ description: f.commodity, quantity: f.pieces === '—' ? '' : f.pieces, dimensions: f.dimensions, weight: f.weight === '—' ? '' : f.weight }];
  const hasVehicles = f.freight?.some((x) => x.vehicle || x.vin) ?? false;

  return (
    <Document title={`${docName} ${f.orderNumber}${f.version ? ` v${f.version}` : ''}`} author={COMPANY.legalName}>
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
            <Text style={s.kicker}>{kicker}</Text>
            <Text style={s.title}>{docTitle}</Text>
          </View>
          <View>
            <Text style={s.orderLbl}>ORDER #</Text>
            <Text style={s.orderNum}>{f.orderNumber}</Text>
            <Text style={[s.pill, { color: status.color }]}>{status.text}</Text>
          </View>
        </View>
        <View style={s.redRule} />

        {d.voidNote ? (
          <View style={s.voidBox}>
            <Text style={s.voidHead}>VOID — THIS VERSION IS NO LONGER VALID</Text>
            <Text style={s.voidTxt}>
              {d.voidNote}. {sig
                ? `It was signed by the ${carrier ? 'carrier' : 'client'} at the time and is kept as a record only.`
                : `It was sent to the ${carrier ? 'carrier' : 'client'} and never signed.`} Only the latest {docName} for this load applies.
            </Text>
          </View>
        ) : !sig ? (
          <View style={[s.banner, { borderColor: '#fcd34d', backgroundColor: '#fffbeb' }]}>
            <Text style={{ fontSize: 8, color: '#92400e' }}>
              COPY — this version was sent to the {carrier ? 'carrier' : 'client'} and was not signed.
            </Text>
          </View>
        ) : null}

        {facts.length > 0 && (
          <View style={s.strip}>
            {facts.map((x, i) => (
              <View key={x.label} style={i === 0 ? s.stripFirst : s.stripCell}>
                <Text style={s.label}>{x.label.toUpperCase()}</Text>
                <Text style={s.value}>{x.value}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={s.row} wrap={false}>
          <Panel title={carrier ? 'CARRIER' : 'CLIENT'} style={s.col}>
            <Text style={s.partyName}>{f.partyName || '—'}</Text>
            {!carrier && f.clientContactName && f.clientContactName !== f.partyName
              ? <Text style={s.line}>Attn: {f.clientContactName}</Text> : null}
            {!carrier && (f.clientAddressLines ?? []).map((l) => <Text key={l} style={s.line}>{l}</Text>)}
            {!carrier && f.clientPhone ? <Text style={s.line}>Phone: {f.clientPhone}</Text> : null}
            {carrier && f.driverName ? <Text style={s.line}>Driver: {f.driverName}</Text> : null}
            {d.sentTo ? <Text style={s.line}>Email: {d.sentTo}</Text> : null}
          </Panel>
          <View style={s.gap} />
          <View style={[s.panel, s.col]}>
            <PanelHead title={carrier ? 'CARRIER PAY' : 'PRICE AND PAYMENT'} />
            <View style={s.priceBand}>
              <Text style={s.priceLbl}>{carrier ? 'TOTAL PAY' : 'TOTAL TARIFF'}</Text>
              <Text style={s.priceVal}>{f.rate}</Text>
            </View>
            <View style={s.panelBody}>
              {!carrier && <Field label="Payment method" value={f.payment?.method || 'As invoiced'} />}
              {!carrier && f.payment?.fee ? <Field label="Payment fee" value={f.payment.fee} /> : null}
              {f.payment?.parts && f.payment.parts.length > 0 ? (
                <View style={s.field}>
                  <Text style={s.label}>PAID IN PARTS</Text>
                  {f.payment.parts.map((p) => (
                    <View key={p.label} style={s.partRow}><Text style={s.line}>{p.label}</Text><Text style={s.line}>{p.amount}</Text></View>
                  ))}
                </View>
              ) : null}
              {f.sentByEmail
                ? <Field label={carrier ? 'Dispatch' : 'Questions'} value={`${f.sentByName ? `${f.sentByName} · ` : ''}${f.sentByEmail}`} />
                : null}
            </View>
          </View>
        </View>

        <View style={s.row} wrap={false}>
          <Panel title="SHIPMENT DETAILS" style={s.col}>
            {/* With a picture beside it there is no room for two columns, so the stops stack. */}
            <View style={{ flexDirection: photo ? 'column' : 'row' }}>
              <StopColumn title={pickups.length > 1 ? 'ORIGINS' : 'ORIGIN'} stops={pickups} prefix="P" color={TTL.navy}
                lane={f.originStr} date={f.pickupDate} stacked={Boolean(photo)} />
              {photo ? null : <View style={s.gap} />}
              <StopColumn title={deliveries.length > 1 ? 'DESTINATIONS' : 'DESTINATION'} stops={deliveries} prefix="D" color={TTL.red}
                lane={f.destinationStr} date={f.deliveryDate} stacked={Boolean(photo)} />
            </View>
          </Panel>
          {photo ? <View style={s.gap} /> : null}
          {photo ? (
            <Panel title="LOAD PICTURE" style={{ width: 200 }}>
              <PdfImage src={photo} style={s.photo} />
            </Panel>
          ) : null}
        </View>

        <View style={[s.panel, { marginBottom: 10 }]} wrap={false}>
          <PanelHead title={hasVehicles ? 'VEHICLES AND FREIGHT' : 'FREIGHT'} />
          <View style={s.tHead}>
            <Text style={[s.th, s.cDesc]}>DESCRIPTION</Text>
            <Text style={[s.th, s.cQty]}>QTY</Text>
            <Text style={[s.th, s.cDim]}>DIMENSIONS</Text>
            <Text style={[s.th, s.cWt]}>WEIGHT</Text>
          </View>
          {freight.map((x, i) => {
            const vehicle = 'vehicle' in x ? x.vehicle : undefined;
            const vin = 'vin' in x ? x.vin : undefined;
            return (
              <View key={i} style={i === 0 ? { flexDirection: 'row' } : s.tRow}>
                <View style={[s.td, s.cDesc]}>
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>{x.description || vehicle || '—'}</Text>
                  {vehicle && x.description ? <Text style={s.sub}>{vehicle}</Text> : null}
                  {vin ? <Text style={s.vin}>VIN {vin}</Text> : null}
                </View>
                <Text style={[s.td, s.cQty]}>{x.quantity || '—'}</Text>
                <Text style={[s.td, s.cDim]}>{x.dimensions || '—'}</Text>
                <Text style={[s.td, s.cWt]}>{x.weight || '—'}</Text>
              </View>
            );
          })}
          {f.weight !== '—' && freight.length > 1 ? (
            <View style={s.totalRow}>
              <Text style={[s.label, { marginBottom: 0 }]}>TOTAL WEIGHT</Text>
              <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold' }}>{f.weight}</Text>
            </View>
          ) : null}
        </View>

        {f.instructions ? (
          <Panel title="SPECIAL INSTRUCTIONS" style={{ marginBottom: 10 }}>
            <Text style={s.terms}>{f.instructions}</Text>
          </Panel>
        ) : null}

        {/* Only on links sent before notes became internal — see SignFormData.notes. */}
        {f.notes ? (
          <Panel title="NOTES" style={{ marginBottom: 10 }}>
            <Text style={s.terms}>{f.notes}</Text>
          </Panel>
        ) : null}

        {f.signerInstructions ? (
          <Panel title="SPECIAL INSTRUCTIONS ADDED BY THE CLIENT WHEN SIGNING" style={{ marginBottom: 10 }}>
            <Text style={s.terms}>{f.signerInstructions}</Text>
          </Panel>
        ) : null}

        {sig ? (
          <View style={s.cert} wrap={false}>
            <View style={s.certHead}>
              <Text style={s.certTitle}>DIGITAL SIGNATURE CERTIFICATE</Text>
              <Text style={s.certBadge}>SIGNED ELECTRONICALLY</Text>
            </View>
            <Text style={s.consent}>
              By choosing to sign electronically and entering their full name, the signer agreed that this electronic
              signature has the same legal effect as a handwritten one
              {sig.termsAccepted
                ? (carrier
                  ? ', and accepted the terms of this dispatch sheet set out below.'
                  : ', accepted the terms and conditions set out below, and confirmed the rate, the pickup and delivery details and the payment terms.')
                : '.'}
            </Text>
            <View style={s.certBody}>
              <View style={{ flex: 1 }}>
                <Text style={s.sigName}>{sig.name}</Text>
                {[
                  ['Signed by:', [sig.name, sig.title].filter(Boolean).join(', ')],
                  ['On behalf of:', f.partyName],
                  ['Signed on:', sig.at],
                  ['IP address:', sig.ip || 'not recorded'],
                  ['Device:', sig.device || 'not recorded'],
                  ['E-sign consent:', sig.esignConsent ? 'Given' : 'Not recorded'],
                ].map(([k, v]) => (
                  <View key={k} style={s.kv}><Text style={s.k}>{k}</Text><Text style={s.v}>{v || '—'}</Text></View>
                ))}
              </View>
              {d.qr ? (
                <View style={s.qrWrap}>
                  {d.link
                    ? <Link src={d.link}><PdfImage src={d.qr} style={{ width: 70, height: 70 }} /></Link>
                    : <PdfImage src={d.qr} style={{ width: 70, height: 70 }} />}
                  <Text style={s.qrText}>Scan to open this agreement&apos;s link, where the signed copy can be downloaded again.</Text>
                </View>
              ) : null}
            </View>
            <Text style={s.esignNote}>
              Signed under the U.S. E-SIGN Act. The signer&apos;s name, title, IP address, device, and the date and time were
              recorded by Total Transport Logistics at the moment of signing.
            </Text>
            <View style={s.printBar}>
              <Text style={s.printLbl}>DIGITAL FINGERPRINT (SHA-256)</Text>
              <Text style={s.printVal}>{sig.fingerprint}</Text>
            </View>
          </View>
        ) : null}

        {/*
          Not boxed like the panels above: the terms run over a page break, and
          a border split across pages draws open-ended boxes.
          minPresenceAhead keeps the heading off the foot of a page.
        */}
        <View minPresenceAhead={60}>
          <PanelHead title="TERMS AND CONDITIONS" />
        </View>
        <Text style={[s.terms, { paddingHorizontal: 8, paddingTop: 7 }]}>{f.terms || ''}</Text>

        {/* Last, so it is drawn over the content; `fixed` repeats it on every page. */}
        {d.voidNote ? (
          <View style={s.voidLayer} fixed>
            <Text style={s.voidMark}>VOID</Text>
          </View>
        ) : null}

        <View style={s.footer} fixed>
          <Text style={s.footTxt}>{COMPANY.legalName} · {COMPANY.phone} · {COMPANY.web}</Text>
          <Text style={s.footTxt}>{docName} · Order {f.orderNumber}</Text>
          <Text style={s.footTxt} render={({ pageNumber, totalPages }) => `Generated ${d.generatedAt} · Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function generateSignedAgreementBuffer(d: SignedAgreementData): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToBuffer(React.createElement(AgreementDocument, { d }) as any) as Promise<Buffer>;
}
