import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image as PdfImage, renderToBuffer } from '@react-pdf/renderer';
import { COMPANY, TTL, logoFull } from './pdfBrand';
import {
  authorityLabel, fmcsaDollars, fmcsaRate, INSURANCE_KIND_LABEL, MIN_OPERATING_MONTHS, safetyRatingLabel,
} from '@/types/fmcsa';
import { VETTING_TRIGGER_LABEL, vettingLevel, type CarrierVetting, type VettingFile } from '@/types/carrierVetting';

/**
 * The Carrier Selection File: one vetting record (src/types/carrierVetting.ts)
 * as a document a lawyer, an insurer or a court can read without TTMS.
 *
 * Built on demand from the stored record, never stored itself — the record is
 * the evidence and this is a way of reading it, so a better layout next year
 * reprints every old record in it. What it must never do is show anything
 * that was not in the record: no live carrier details, no current FMCSA
 * answer. The one live fact is the integrity check, which is the point of it.
 *
 * Dates are spelled out, as on everything that leaves the company, and times
 * carry their zone: "3:14 PM" means nothing to a reader in another state.
 */

export interface VettingPdfInput {
  v: CarrierVetting;
  /** Whether the record and each file still match their fingerprints, checked as this is printed. */
  intact: { record: boolean; saferWeb: boolean | null; insurance: boolean | null };
  printedAt: number;
  printedBy: string;
  /**
   * This copy's id in the record's `prints` — on the page, so a copy that
   * turns up somewhere can be matched to the one TTMS kept of it.
   */
  printId: string;
}

const s = StyleSheet.create({
  page:     { paddingTop: 32, paddingBottom: 48, paddingHorizontal: 36, fontSize: 9, fontFamily: 'Helvetica', color: TTL.ink },
  head:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12,
              borderBottomWidth: 2, borderBottomColor: TTL.navy, borderBottomStyle: 'solid', paddingBottom: 8 },
  title:    { fontSize: 16, fontFamily: 'Helvetica-Bold', color: TTL.navy },
  sub:      { fontSize: 8, color: TTL.muted, marginTop: 2 },
  sec:      { marginBottom: 10 },
  secTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: TTL.navy, backgroundColor: TTL.wash, paddingVertical: 3, paddingHorizontal: 5, marginBottom: 5 },
  grid:     { flexDirection: 'row', flexWrap: 'wrap' },
  cell:     { width: '33.33%', paddingRight: 6, marginBottom: 5 },
  cellWide: { width: '100%', marginBottom: 5 },
  label:    { fontSize: 7, color: TTL.faint, marginBottom: 1 },
  value:    { fontSize: 9 },
  line:     { fontSize: 9, marginBottom: 2 },
  bad:      { color: TTL.red, fontFamily: 'Helvetica-Bold' },
  warn:     { color: '#92400e' },
  ok:       { color: '#166534' },
  mono:     { fontFamily: 'Courier', fontSize: 7 },
  check:    { flexDirection: 'row', marginBottom: 3 },
  box:      { width: 22, fontFamily: 'Helvetica-Bold' },
  note:     { fontSize: 7.5, color: TTL.muted, lineHeight: 1.35 },
  footer:   { position: 'absolute', bottom: 16, left: 36, right: 36, flexDirection: 'column', gap: 2,
              fontSize: 7, color: TTL.faint },
});

const TZ = 'America/Guatemala';

function day(ms: number | null | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** "October 28, 2026, 3:14 PM (UTC-6)". */
function when(ms: number | null | undefined): string {
  if (!ms) return '—';
  const t = new Date(ms).toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ,
  });
  return `${t} (UTC-6)`;
}

/** A YYYY-MM-DD from FMCSA, spelled out. */
function isoDay(iso: string | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '—';
  return day(Date.parse(`${iso}T00:00:00Z`));
}

function dollars(n: number | null | undefined): string {
  if (n == null) return 'Not recorded';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function F({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={wide ? s.cellWide : s.cell}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value || '—'}</Text>
    </View>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.sec} wrap={false}>
      <Text style={s.secTitle}>{title}</Text>
      {children}
    </View>
  );
}

function yn(v: string): string {
  return v === 'Y' ? 'Yes' : v === 'N' ? 'No' : v || '—';
}

function fileLine(f: VettingFile | null, intact: boolean | null, error: string | undefined, name: string) {
  if (!f) return <Text style={s.line}>{name}: not kept{error ? ` — ${error}` : ''}</Text>;
  return (
    <View style={{ marginBottom: 4 }}>
      <Text style={s.line}>
        {name}: kept ({Math.max(1, Math.round(f.bytes / 1024))} KB) —{' '}
        <Text style={intact ? s.ok : s.bad}>{intact ? 'unchanged since it was saved' : 'DOES NOT MATCH what was saved'}</Text>
      </Text>
      <Text style={s.note}>Copied from {f.source}</Text>
      <Text style={s.mono}>SHA-256 {f.sha256}</Text>
    </View>
  );
}

function VettingDocument({ d }: { d: VettingPdfInput }) {
  const { v } = d;
  const a = v.fmcsa;
  const reg = a?.registry ?? null;
  const level = vettingLevel(v);
  const verdict = {
    ok:      { text: 'FMCSA raised no concerns.', style: s.ok },
    warn:    { text: 'FMCSA showed something to look at — see below.', style: s.warn },
    bad:     { text: 'FMCSA showed a problem — see below.', style: s.bad },
    unknown: { text: 'No FMCSA answer was available.', style: s.bad },
  }[level];
  const logo = logoFull();

  return (
    <Document title={`Carrier Selection File — ${v.orderNumber}`} author={COMPANY.legalName}>
      <Page size="LETTER" style={s.page}>
        <View style={s.head}>
          <View>
            <Text style={s.title}>Carrier Selection File</Text>
            <Text style={s.sub}>Load {v.orderNumber} · {v.carrier.name || 'Carrier'}</Text>
            <Text style={s.sub}>Record taken {when(v.takenAt)} by {v.takenByName}{v.takenByEmail ? ` (${v.takenByEmail})` : ''}</Text>
          </View>
          <PdfImage src={logo} style={{ height: 34 }} />
        </View>

        <Sec title="ABOUT THIS RECORD">
          <View style={s.grid}>
            <F label="Taken because" value={`${VETTING_TRIGGER_LABEL[v.trigger]}${v.dispatchVersion ? ` (version ${v.dispatchVersion})` : ''}`} />
            <F label="Record ID" value={v.id} />
            <F label="Integrity" value={d.intact.record ? 'Unchanged since it was taken' : 'DOES NOT MATCH — the record was altered after it was taken'} />
          </View>
          <Text style={s.note}>
            Written once by TTMS, {COMPANY.legalName}&apos;s transport management system, at the moment shown, and never
            edited: the system offers no way to change or delete it. What follows is what TTMS knew about the carrier at
            that moment — FMCSA&apos;s answer, the carrier&apos;s details and insurance, and the checks staff confirmed —
            not what is true today.
          </Text>
          <Text style={[s.mono, { marginTop: 3 }]}>Record SHA-256 {v.hash}</Text>
        </Sec>

        <Sec title="FMCSA — ASKED AS THE RECORD WAS TAKEN">
          <Text style={s.line}>
            {v.fmcsaSource === 'live'
              ? `Looked up live with FMCSA at ${when(v.fmcsaAt)}.`
              : v.fmcsaSource === 'stored'
                ? `FMCSA could not be reached (${v.fmcsaError}). Shown instead: the carrier's last FMCSA check, made ${when(v.fmcsaAt)}.`
                : `FMCSA could not be reached (${v.fmcsaError}), and the carrier had never been checked.`}
          </Text>
          <Text style={[s.line, verdict.style]}>{verdict.text}</Text>
          {v.concerns.map((c) => (
            <Text key={c.text} style={[s.line, c.level === 'bad' ? s.bad : s.warn]}>• {c.text}</Text>
          ))}
          {a?.found && (
            <View style={[s.grid, { marginTop: 4 }]}>
              <F label="Legal name" value={`${a.legalName}${a.dbaName ? ` (DBA ${a.dbaName})` : ''}`} />
              <F label="USDOT / dockets" value={`DOT ${a.dotNumber || '—'}${a.docketNumbers.length ? ` · MC ${a.docketNumbers.join(', ')}` : ''}`} />
              <F label="Based in" value={[a.city, a.state].filter(Boolean).join(', ')} />
              <F label="Allowed to operate" value={yn(a.allowedToOperate)} />
              <F label="USDOT status" value={a.statusCode === 'A' ? 'Active' : a.statusCode === 'I' ? 'Inactive' : a.statusCode} />
              <F label="Out-of-service order" value={a.oosDate || 'None'} />
              <F label="Common authority" value={authorityLabel(a.commonAuthority)} />
              <F label="Contract authority" value={authorityLabel(a.contractAuthority)} />
              <F label={`Operating since (minimum ${MIN_OPERATING_MONTHS} months)`}
                value={v.operatingSince ? `${isoDay(v.operatingSince.day)} (${v.operatingSince.source === 'authority' ? 'authority granted' : 'DOT registered'})` : 'Unknown'} />
              <F label="Safety rating" value={`${safetyRatingLabel(a.safetyRating)}${a.safetyRatingDate ? ` (${a.safetyRatingDate})` : ''}`} />
              <F label="Liability on file" value={`${a.liabilityOnFile > 0 ? fmcsaDollars(a.liabilityOnFile) : 'None'}${a.liabilityRequired === 'Y' && a.liabilityRequiredAmount > 0 ? ` (requires ${fmcsaDollars(a.liabilityRequiredAmount)})` : ''}`} />
              <F label="Cargo on file" value={a.cargoOnFile > 0 ? fmcsaDollars(a.cargoOnFile) : 'None'} />
              <F label="Fleet" value={`${a.powerUnits} trucks · ${a.drivers} drivers`} />
              <F label="Crashes (24 months)" value={`${a.crashTotal}${a.fatalCrash ? ` · ${a.fatalCrash} fatal` : ''}`} />
              <F label="MCS-150 overdue" value={yn(a.mcs150Outdated)} />
              <F label="Vehicle out-of-service rate" value={`${fmcsaRate(a.vehicleOosRate)} of ${a.vehicleInspections} inspections (national ${fmcsaRate(a.vehicleOosNational)})`} />
              <F label="Driver out-of-service rate" value={`${fmcsaRate(a.driverOosRate)} of ${a.driverInspections} inspections (national ${fmcsaRate(a.driverOosNational)})`} />
              {reg && <F label="Registered phone / email" value={[reg.phone || reg.cellPhone, reg.email].filter(Boolean).join(' · ')} />}
              {reg && <F label="Company officer" value={reg.officer} />}
              {reg && reg.policies.length > 0 && (
                <F wide label={`Insurance filed with FMCSA (open data as of ${isoDay(reg.asOf)})`}
                  value={reg.policies.map((p) =>
                    `${INSURANCE_KIND_LABEL[p.kind]}${p.excess ? ' (excess)' : ''}: ${p.company || 'Unnamed insurer'}${p.policyNo ? `, policy ${p.policyNo}` : ''}${p.amount ? `, ${dollars(p.amount)}` : ''}${p.effectiveDate ? `, since ${isoDay(p.effectiveDate)}` : ''}`,
                  ).join('\n')} />
              )}
              {reg && reg.pendingCancellations.length > 0 && (
                <F wide label="Pending cancellations"
                  value={reg.pendingCancellations.map((p) =>
                    `${INSURANCE_KIND_LABEL[p.kind]}: ${p.company}${p.policyNo ? `, policy ${p.policyNo}` : ''}, cancels ${isoDay(p.cancelDate)}${p.replaced ? ' (another policy stays on file)' : ''}`,
                  ).join('\n')} />
              )}
            </View>
          )}
        </Sec>

        <Sec title="CARRIER AS RECORDED IN TTMS">
          <View style={s.grid}>
            <F label="Company" value={v.carrier.name} />
            <F label="DOT / MC" value={`DOT ${v.carrier.dot || '—'} · MC ${v.carrier.mc || '—'}`} />
            <F label="Phone" value={v.carrier.phone} />
            <F label="Email" value={v.carrier.email} />
            <F label="Contact" value={v.carrier.contactName} />
            <F label="Dispatcher" value={[v.carrier.dispatcher, v.carrier.dispatcherPhone].filter(Boolean).join(' · ')} />
            <F wide label="Address" value={v.carrier.address} />
          </View>
        </Sec>

        <Sec title="CERTIFICATE OF INSURANCE ON FILE">
          <View style={s.grid}>
            <F label="Insurer" value={v.carrier.insuranceProvider} />
            <F label="Policy" value={v.carrier.insurancePolicyNumber} />
            <F label="Expires" value={day(v.carrier.insuranceExpiration)} />
            <F label="Liability" value={dollars(v.carrier.liabilityCoverage)} />
            <F label="Cargo" value={dollars(v.carrier.cargoCoverage)} />
            <F label="Expired before pickup?"
              value={v.carrier.insuranceExpiration && v.load.pickupDate
                ? (v.carrier.insuranceExpiration < v.load.pickupDate ? 'YES — expires before the pickup date' : 'No')
                : 'Cannot tell — a date is missing'} />
          </View>
        </Sec>

        <Sec title="CARRIER REVIEW — CONFIRMED BY STAFF">
          {v.review ? v.review.checks.map((c) => (
            <View key={c.key} style={s.check}>
              <Text style={[s.box, c.byName ? s.ok : s.bad]}>{c.byName ? 'YES' : 'NO'}</Text>
              <Text style={{ flex: 1 }}>
                {c.label} — {c.byName ? `confirmed by ${c.byName}${c.at ? `, ${when(c.at)}` : ''}` : 'not confirmed'}
              </Text>
            </View>
          )) : (
            <Text style={s.line}>No carrier review was asked for on this load before the record was taken.</Text>
          )}
        </Sec>

        <Sec title="DRIVER, TRUCK AND LOAD">
          <View style={s.grid}>
            <F label="Driver" value={[v.driver.name, v.driver.phone].filter(Boolean).join(' · ')} />
            <F label="Driver's licence" value={v.driver.licenseOnFile ? `On file${v.driver.licenseExpiration ? `, expires ${day(v.driver.licenseExpiration)}` : ''}` : 'Not on file'} />
            <F label="Truck pictures" value={v.truckPhotos ? `${v.truckPhotos} on file` : 'None on file'} />
            <F label="Pickup" value={`${v.load.pickup || '—'}${v.load.pickupDate ? `, ${day(v.load.pickupDate)}` : ''}`} />
            <F label="Delivery" value={v.load.delivery} />
            <F label="Freight / equipment" value={[v.load.commodity, v.load.equipment].filter(Boolean).join(' · ')} />
          </View>
        </Sec>

        <Sec title="EVIDENCE KEPT WITH THIS RECORD">
          {fileLine(v.files.saferWeb, d.intact.saferWeb, v.fileErrors?.saferWeb, 'FMCSA SaferWeb page')}
          {fileLine(v.files.insurance, d.intact.insurance, v.fileErrors?.insurance, 'Certificate of insurance')}
          <Text style={s.note}>
            Each file is a copy taken with the record. Its SHA-256 fingerprint was stored at the same moment; any change
            to the file since would change the fingerprint, and this page checks it each time it is printed.
          </Text>
        </Sec>

        <View style={s.footer} fixed>
          <Text>{COMPANY.legalName} · {COMPANY.street}, {COMPANY.city} · {COMPANY.phone}</Text>
          <Text render={({ pageNumber, totalPages }) => `Copy ${d.printId} · printed ${when(d.printedAt)} by ${d.printedBy} · Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export function generateVettingPdf(d: VettingPdfInput): Promise<Buffer> {
  return renderToBuffer(<VettingDocument d={d} />);
}
