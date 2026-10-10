import React from 'react';
import path from 'path';
import { Document, Page, Text, View, StyleSheet, Image as PdfImage, renderToBuffer } from '@react-pdf/renderer';
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
}

export interface SignedAgreementData {
  form: SignFormData;
  /** Null for a version that was sent and never signed. */
  signature: AgreementSignature | null;
  /** Who the link was emailed to. */
  sentTo: string;
  /** "Replaced by version 3 on October 9, 2026", for a version superseded before or after signing. */
  supersededNote: string;
  generatedAt: string;
}

/** A signature time as it prints: spelled-out date, 12-hour time, in UTC. */
export function signatureTime(d: Date): string {
  const date = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  return `${date} at ${time} UTC`;
}

const NAVY  = '#1e3a5f';
const GRAY  = '#e5e7eb';
const LGRAY = '#f9fafb';

const s = StyleSheet.create({
  page:      { padding: 36, fontSize: 9, fontFamily: 'Helvetica', color: '#111827', backgroundColor: '#ffffff' },
  header:    { backgroundColor: NAVY, padding: 14, marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderRadius: 3 },
  hLabel:    { color: '#93c5fd', fontSize: 7, marginBottom: 3 },
  hTitle:    { color: '#ffffff', fontSize: 16, fontFamily: 'Helvetica-Bold' },
  hRight:    { alignItems: 'flex-end' },
  hNum:      { color: '#ffffff', fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  hDate:     { color: '#d1d5db', fontSize: 8 },
  banner:    { borderWidth: 1, borderStyle: 'solid', borderRadius: 3, padding: 8, marginBottom: 10 },
  secTitle:  { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#6b7280', marginBottom: 5, borderBottomWidth: 1, borderBottomColor: GRAY, borderBottomStyle: 'solid', paddingBottom: 3 },
  row2:      { flexDirection: 'row', marginBottom: 10 },
  card:      { flex: 1, borderWidth: 1, borderColor: GRAY, borderStyle: 'solid', borderRadius: 3, padding: 8, marginRight: 8 },
  cardLast:  { flex: 1, borderWidth: 1, borderColor: GRAY, borderStyle: 'solid', borderRadius: 3, padding: 8 },
  box:       { borderWidth: 1, borderColor: GRAY, borderStyle: 'solid', borderRadius: 3, padding: 8, marginBottom: 10 },
  fLabel:    { fontSize: 7, color: '#9ca3af', marginBottom: 1 },
  fValue:    { fontSize: 9, color: '#111827', marginBottom: 4 },
  stopHead:  { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#111827' },
  stopLine:  { fontSize: 8, color: '#374151' },
  stopDate:  { fontSize: 8, color: '#6b7280', marginBottom: 5 },
  table:     { borderWidth: 1, borderColor: GRAY, borderStyle: 'solid', borderRadius: 3, marginBottom: 10 },
  tHead:     { flexDirection: 'row', backgroundColor: LGRAY, borderBottomWidth: 1, borderBottomColor: GRAY, borderBottomStyle: 'solid' },
  tRow:      { flexDirection: 'row', borderTopWidth: 1, borderTopColor: GRAY, borderTopStyle: 'solid' },
  th:        { flex: 1, padding: 5, fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#6b7280' },
  thWide:    { flex: 3, padding: 5, fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#6b7280' },
  td:        { flex: 1, padding: 5, fontSize: 8, color: '#111827' },
  tdWide:    { flex: 3, padding: 5, fontSize: 8, color: '#111827' },
  money:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  moneyBig:  { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#111827' },
  terms:     { fontSize: 7, color: '#374151', lineHeight: 1.4 },
  sigBox:    { borderWidth: 1, borderColor: '#a7f3d0', borderStyle: 'solid', backgroundColor: '#f0fdf4', borderRadius: 3, padding: 10, marginBottom: 10 },
  sigTitle:  { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#065f46', marginBottom: 6 },
  sigName:   { fontSize: 18, fontFamily: 'Times-Italic', color: '#111827', marginBottom: 2 },
  sigLine:   { fontSize: 8, color: '#047857', marginBottom: 2 },
  footer:    { borderTopWidth: 1, borderTopColor: GRAY, borderTopStyle: 'solid', paddingTop: 8, marginTop: 4, flexDirection: 'row', justifyContent: 'space-between' },
  footerTxt: { fontSize: 7, color: '#9ca3af' },
});

const LOGO_PATH = path.join(process.cwd(), 'public', 'logo-circle.png');

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={s.fLabel}>{label}</Text>
      <Text style={s.fValue}>{value || '—'}</Text>
    </View>
  );
}

function Stops({ title, stops }: { title: string; stops: NonNullable<SignFormData['stops']> }) {
  return (
    <View>
      <Text style={s.secTitle}>{title}</Text>
      {stops.length === 0 ? <Text style={s.stopLine}>To be confirmed</Text> : stops.map((st, i) => {
        const head = st.name || st.street || st.place || 'Address to be confirmed';
        const lines = [st.street, st.place].filter((l) => l && l !== head);
        return (
          <View key={i} wrap={false}>
            <Text style={s.stopHead}>{stops.length > 1 ? `${i + 1}. ` : ''}{head}</Text>
            {lines.map((l) => <Text key={l} style={s.stopLine}>{l}</Text>)}
            <Text style={s.stopDate}>{st.dates || 'Date to be confirmed'}</Text>
          </View>
        );
      })}
    </View>
  );
}

function AgreementDocument({ d }: { d: SignedAgreementData }) {
  const f = d.form;
  const detailed = Array.isArray(f.stops) && f.stops.length > 0;
  const pickups = (f.stops ?? []).filter((x) => x.kind === 'pickup');
  const deliveries = (f.stops ?? []).filter((x) => x.kind === 'delivery');
  const sig = d.signature;
  // The carrier's copy names the carrier and the driver and quotes carrier
  // pay; it never shows the client's rate, which is our margin's other half.
  const carrier = f.type === 'carrier_agreement';
  const docTitle = carrier ? 'CARRIER RATE CONFIRMATION' : 'CLIENT LOAD CONFIRMATION';
  const docName = carrier ? 'Carrier Agreement' : 'Shipper Agreement';

  return (
    <Document title={`${docName} ${f.orderNumber}${f.version ? ` v${f.version}` : ''}`} author="Total Transport Logistics">
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <PdfImage src={LOGO_PATH} style={{ width: 46, height: 46, marginRight: 10 }} />
            <View>
              <Text style={s.hLabel}>TOTAL TRANSPORT LOGISTICS</Text>
              <Text style={s.hTitle}>{docTitle}</Text>
            </View>
          </View>
          <View style={s.hRight}>
            <Text style={s.hNum}>{f.orderNumber}</Text>
            {f.version ? <Text style={s.hDate}>Version {f.version}</Text> : null}
            <Text style={s.hDate}>{sig ? 'Signed' : 'Not signed'}</Text>
          </View>
        </View>

        {!sig && (
          <View style={[s.banner, { borderColor: '#fcd34d', backgroundColor: '#fffbeb' }]}>
            <Text style={{ fontSize: 8, color: '#92400e' }}>
              COPY — this version was sent to the {carrier ? 'carrier' : 'client'} and was not signed.{d.supersededNote ? ` ${d.supersededNote}.` : ''}
            </Text>
          </View>
        )}
        {sig && d.supersededNote ? (
          <View style={[s.banner, { borderColor: GRAY, backgroundColor: LGRAY }]}>
            <Text style={{ fontSize: 8, color: '#374151' }}>{d.supersededNote}. This is the version the client signed at the time.</Text>
          </View>
        ) : null}

        <View style={s.row2}>
          <View style={s.card}>
            <Text style={s.secTitle}>{carrier ? 'CARRIER' : 'CLIENT'}</Text>
            <Field label="Company" value={f.partyName} />
            {carrier && f.driverName ? <Field label="Driver" value={f.driverName} /> : null}
            <Field label="Sent to" value={d.sentTo} />
          </View>
          <View style={s.cardLast}>
            <Text style={s.secTitle}>{carrier ? 'CARRIER PAY' : 'AGREED RATE'}</Text>
            <Text style={s.moneyBig}>{f.rate}</Text>
            <View style={{ marginTop: 6 }}>
              {!carrier && <Field label="Payment method" value={f.payment?.method || 'As invoiced'} />}
              {!carrier && f.payment?.fee ? <Field label="Payment fee" value={f.payment.fee} /> : null}
              {f.sentByName ? <Field label="Your contact" value={f.sentByEmail ? `${f.sentByName} · ${f.sentByEmail}` : f.sentByName} /> : null}
            </View>
          </View>
        </View>

        {f.payment?.parts && f.payment.parts.length > 0 && (
          <View style={s.box}>
            <Text style={s.secTitle}>PAID IN PARTS</Text>
            {f.payment.parts.map((p) => (
              <View key={p.label} style={s.money}><Text>{p.label}</Text><Text>{p.amount}</Text></View>
            ))}
          </View>
        )}

        {detailed ? (
          <View style={s.row2}>
            <View style={s.card}><Stops title={pickups.length > 1 ? 'PICKUPS' : 'PICKUP'} stops={pickups} /></View>
            <View style={s.cardLast}><Stops title={deliveries.length > 1 ? 'DELIVERIES' : 'DELIVERY'} stops={deliveries} /></View>
          </View>
        ) : (
          <View style={s.row2}>
            <View style={s.card}>
              <Text style={s.secTitle}>PICKUP</Text>
              <Field label="From" value={f.originStr} />
              <Field label="Date" value={f.pickupDate} />
            </View>
            <View style={s.cardLast}>
              <Text style={s.secTitle}>DELIVERY</Text>
              <Field label="To" value={f.destinationStr} />
              <Field label="Date" value={f.deliveryDate} />
            </View>
          </View>
        )}

        <View style={s.table} wrap={false}>
          <View style={s.tHead}>
            <Text style={s.thWide}>FREIGHT{f.equipment ? ` · ${f.equipment.toUpperCase()}` : ''}</Text>
            <Text style={s.th}>QTY</Text>
            <Text style={s.th}>DIMENSIONS</Text>
            <Text style={s.th}>WEIGHT</Text>
          </View>
          {f.freight && f.freight.length > 0 ? f.freight.map((x, i) => (
            <View key={i} style={s.tRow}>
              <Text style={s.tdWide}>{x.description || '—'}</Text>
              <Text style={s.td}>{x.quantity || '—'}</Text>
              <Text style={s.td}>{x.dimensions || '—'}</Text>
              <Text style={s.td}>{x.weight || '—'}</Text>
            </View>
          )) : (
            <View style={s.tRow}>
              <Text style={s.tdWide}>{f.commodity || '—'}</Text>
              <Text style={s.td}>{f.pieces}</Text>
              <Text style={s.td}>{f.dimensions || '—'}</Text>
              <Text style={s.td}>{f.weight}</Text>
            </View>
          )}
        </View>

        {f.notes ? (
          <View style={s.box}>
            <Text style={s.secTitle}>NOTES</Text>
            <Text style={s.terms}>{f.notes}</Text>
          </View>
        ) : null}

        <View style={s.box}>
          <Text style={s.secTitle}>TERMS AND CONDITIONS</Text>
          <Text style={s.terms}>{f.terms || ''}</Text>
        </View>

        {sig ? (
          <View style={s.sigBox} wrap={false}>
            <Text style={s.sigTitle}>ELECTRONIC SIGNATURE</Text>
            <Text style={s.sigName}>{sig.name}</Text>
            <Text style={s.sigLine}>{[sig.title, f.partyName ? `on behalf of ${f.partyName}` : ''].filter(Boolean).join(', ')}</Text>
            <Text style={s.sigLine}>Signed {sig.at}</Text>
            <Text style={s.sigLine}>IP address {sig.ip || 'not recorded'} · {sig.device || 'device not recorded'}</Text>
            <Text style={s.sigLine}>
              {sig.esignConsent ? 'Agreed to sign electronically. ' : ''}
              {sig.termsAccepted
                ? (carrier ? 'Accepted the terms of this rate confirmation.' : 'Accepted the terms and confirmed the rate, the pickup and delivery details and the payment terms.')
                : ''}
            </Text>
            <Text style={[s.sigLine, { marginTop: 4, color: '#6b7280' }]}>
              Signed electronically under the E-SIGN Act. The signer&apos;s name, title, IP address, device, and the date and time of signing were recorded at submission.
            </Text>
          </View>
        ) : null}

        <View style={s.footer} fixed>
          <Text style={s.footerTxt}>Total Transport Logistics · totaltransportlogistics.us</Text>
          <Text style={s.footerTxt}>Generated {d.generatedAt}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function generateSignedAgreementBuffer(d: SignedAgreementData): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToBuffer(React.createElement(AgreementDocument, { d }) as any) as Promise<Buffer>;
}
