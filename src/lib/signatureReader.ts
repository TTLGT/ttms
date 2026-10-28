import { getDocumentProxy } from 'unpdf';
import { zoneFromText, type DetectedCarrier, type DetectedSignature, type SignatureZone } from '@/types/signatureRecord';

/**
 * Reads the signature block off a signed agreement PDF — who signed, from
 * which IP, and when — so nobody has to retype what the document already says.
 * See src/types/signatureRecord.ts for where it fits.
 *
 * Runs on our own server with pdf.js (`unpdf`). Nothing is sent anywhere: the
 * paperwork carries rates and client names, and the BATS formats print the
 * signature as text, so plain text extraction is all it takes. A scan or a
 * photo has no text and comes back with nothing found — the form is then
 * typed by hand, which was always the fallback.
 *
 * A **reading, not a record**: the result only pre-fills a form that a person
 * confirms and admin or dispatch approves against the file itself.
 *
 * ## How the text is found
 *
 * pdf.js returns runs of text with positions, in whatever order the PDF drew
 * them — the BATS dispatch sheet draws all four labels of its signature table
 * before any of the values. So the runs are first put back into lines by their
 * height on the page, left to right, and the patterns below are matched
 * against whole lines: a label and its value are on the same line on paper,
 * whatever order they were drawn in.
 */

/** A 25 MB scan of forty pages is not worth reading for a signature on the last. */
const MAX_PAGES = 12;
/** Runs within this many points of each other vertically are the same line. */
const LINE_TOLERANCE = 2.5;

export async function readSignature(bytes: Uint8Array): Promise<DetectedSignature | null> {
  const lines = await textLines(bytes);
  if (lines.length === 0) return null;
  return parseSignature(lines);
}

async function textLines(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(bytes);
  const out: string[] = [];
  for (let p = 1; p <= Math.min(pdf.numPages, MAX_PAGES); p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rows: { y: number; runs: { x: number; s: string }[] }[] = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const x = item.transform[4];
      const y = item.transform[5];
      let row = rows.find((r) => Math.abs(r.y - y) <= LINE_TOLERANCE);
      if (!row) rows.push(row = { y, runs: [] });
      row.runs.push({ x, s: item.str });
    }
    // Top of the page first: PDF y runs upwards.
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      out.push(r.runs.sort((a, b) => a.x - b.x).map((run) => run.s.trim()).join(' ').replace(/\s+/g, ' ').trim());
    }
  }
  return out;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/**
 * "10/27/2026 7:49 PM PST" or "October 9, 2026 at 5:22 PM UTC" → its parts.
 * Exported for the same reason the patterns are kept in one place: a new
 * layout is a new pattern here, not a second parser somewhere else.
 */
export function parseSignedAt(text: string): { date: string; time: string; zone: SignatureZone | null } | null {
  const pad = (n: number) => String(n).padStart(2, '0');
  const clock = (h: number, m: string, ampm: string | undefined) => {
    let hh = h;
    if (ampm) {
      const pm = ampm.toUpperCase() === 'PM';
      if (hh === 12) hh = pm ? 12 : 0;
      else if (pm) hh += 12;
    }
    return hh <= 23 ? `${pad(hh)}:${m}` : null;
  };

  const numeric = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?\s*([A-Za-z]{1,4})?/i.exec(text);
  if (numeric) {
    const [, mo, da, y, h, mi, ampm, z] = numeric;
    const time = clock(+h, mi, ampm);
    if (!time) return null;
    return { date: `${y}-${pad(+mo)}-${pad(+da)}`, time, zone: z ? zoneFromText(z) : null };
  }
  const spelled = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+(?:at\s+)?(\d{1,2}):(\d{2})\s*(AM|PM)?\s*([A-Za-z]{1,4})?/i.exec(text);
  if (spelled) {
    const [, month, da, y, h, mi, ampm, z] = spelled;
    const mo = MONTHS.indexOf(month.toLowerCase()) + 1;
    const time = clock(+h, mi, ampm);
    if (!mo || !time) return null;
    return { date: `${y}-${pad(mo)}-${pad(+da)}`, time, zone: z ? zoneFromText(z) : null };
  }
  return null;
}

/** The first capture of the first line a pattern matches. */
function find(lines: string[], re: RegExp): string | null {
  for (const line of lines) {
    const m = re.exec(line);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return null;
}

const IP = /((?:\d{1,3}\.){3}\d{1,3}|[0-9a-f]*:[0-9a-f:]+)/i;

/**
 * The value beside a label in the dispatch sheet's two-column "CARRIER INFO |
 * BROKER INFO" table. Each printed row comes back as one line holding both
 * columns — "Carrier Name KA LINES INC Broker Name Total Transport…" — so the
 * value is what follows the label, cut where the broker's column starts. An
 * empty cell ("Carrier Address Broker Address 4833…") comes back as null.
 */
function cell(lines: string[], label: RegExp): string | null {
  const re = new RegExp(`^${label.source}(?:\\s+|$)`, 'i');
  for (const line of lines) {
    if (!re.test(line)) continue;
    let rest = line.replace(re, '');
    const broker = rest.search(/\bBroker\b/);
    if (broker >= 0) rest = rest.slice(0, broker);
    return rest.trim() || null;
  }
  return null;
}

/** The carrier and driver a BATS dispatch sheet names. Null when it names nobody. */
function carrierBlock(lines: string[]): DetectedCarrier | null {
  const digits = (v: string | null) => (v ? v.replace(/\D+/g, '') || null : null);
  const block: DetectedCarrier = {
    name:        cell(lines, /Carrier Name/),
    contact:     cell(lines, /Carrier Contact/),
    phone:       cell(lines, /Carrier Phone/),
    address:     cell(lines, /Carrier Address/),
    driverName:  cell(lines, /Carrier Driver Name/),
    driverPhone: cell(lines, /Carrier Driver Phone/),
    // Not on the sample sheet, but a BATS profile can print them, and they
    // are what FMCSA is asked by.
    mc:  digits(cell(lines, /Carrier MC(?:\s*(?:#|Number))?:?/)),
    dot: digits(cell(lines, /Carrier (?:US)?DOT(?:\s*(?:#|Number))?:?/)),
  };
  return block.name || block.mc || block.dot ? block : null;
}

export function parseSignature(lines: string[]): DetectedSignature {
  const all = lines.join('\n');
  const result: DetectedSignature = {
    format: null, party: null, orderNumber: null,
    signerName: null, signerIp: null, date: null, time: null, zone: null,
    signedAtText: null, reference: null, carrier: null,
  };

  result.orderNumber = find(lines, /^Order\s*#\s*([A-Z0-9-]+)/i);

  /*
   * BATS shipper agreement — the "DIGITAL SIGNATURE CERTIFICATE" box:
   *   Electronic Signature: Sako Krikorian
   *   Signature IP Address: 108.147.173.79
   *   Signed and Accepted On: 10/27/2026 7:49 PM PST
   *   Multi-Factor <half of checksum> / Digital Fingerprint Checksum <other half>
   */
  if (/DIGITAL SIGNATURE CERTIFICATE/i.test(all) || /Electronic Signature:/i.test(all)) {
    result.format = 'bats_sa';
    result.party = 'client';
    result.signerName = find(lines, /Electronic Signature:\s*(.+)$/i);
    result.signerIp = find(lines, new RegExp(`Signature IP Address:\\s*${IP.source}`, 'i'));
    result.signedAtText = find(lines, /Signed and Accepted On:\s*(.+)$/i);
    // The checksum is two lines beside two labels, and its second half sits
    // a point or two above its label — far enough to land on a line of its
    // own. So: the label's line if it carries it, else the line under the
    // first half when that line is nothing but checksum characters.
    const a = find(lines, /^Multi-Factor\s+(\S+)$/i);
    const under = lines[lines.findIndex((l) => /^Multi-Factor\s+\S+$/i.test(l)) + 1] ?? '';
    const b = find(lines, /Digital Fingerprint Checksum\s+(\S+)$/i)
      ?? (a && /^[A-Za-z0-9+/=]{16,}$/.test(under) ? under : null);
    result.reference = a || b ? `${a ?? ''}${b ?? ''}` : null;
  }
  /*
   * BATS dispatch sheet — "CARRIER ACCEPTANCE AND SIGNATURE", a table:
   *   I Agree                       Yes
   *   Signature                     Kate
   *   Signatory's IP Address        70.238.96.131
   *   Agreed To Terms On This Day   10/27/2026 3:51 PM CST
   */
  else if (/CARRIER ACCEPTANCE AND SIGNATURE/i.test(all) || /Agreed To Terms On This Day/i.test(all)) {
    result.format = 'bats_ca';
    result.party = 'carrier';
    result.signerName = find(lines, /^Signature\s+(.+)$/i);
    result.signerIp = find(lines, new RegExp(`Signatory[’']?s IP Address\\s+${IP.source}`, 'i'));
    result.signedAtText = find(lines, /Agreed To Terms On This Day\s+(.+)$/i);
    result.carrier = carrierBlock(lines);
  }
  /*
   * TTMS's own signed agreement PDF, re-uploaded: "ELECTRONIC SIGNATURE",
   * then "Signed October 9, 2026 at 5:22 PM UTC" and "IP address …". Its
   * name line has no label, so only the time and IP are taken.
   */
  else if (/^ELECTRONIC SIGNATURE$/im.test(all) && /^Signed\s+[A-Za-z]+\s+\d/im.test(all)) {
    result.format = 'ttms';
    result.party = /Load Confirmation/i.test(all) ? 'client' : /Rate Confirmation|Carrier Agreement/i.test(all) ? 'carrier' : null;
    result.signedAtText = find(lines, /^Signed\s+([A-Za-z]+\s+\d{1,2},\s*\d{4}.*)$/i);
    result.signerIp = find(lines, new RegExp(`^IP address\\s+${IP.source}`, 'i'));
  }

  if (result.signedAtText) {
    const at = parseSignedAt(result.signedAtText);
    if (at) Object.assign(result, at);
  }
  return result;
}
