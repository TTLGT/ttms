import { createHash } from 'crypto';
import { adminDb, adminStorage } from './firebase-admin';
import { lookupCarrier, FmcsaUnavailableError, FmcsaNotConfiguredError } from './fmcsa';
import { fetchFmcsaPage } from './fmcsaPages';
import { recordEvent, type ChangeActor } from './recordHistory';
import { requestRef, saGateFactsFor } from './saRequestsServer';
import { carrierNumber } from '@/types/carrier';
import { fmcsaConcerns, operatingSince, type FmcsaAnswer, type FmcsaRegistry } from '@/types/fmcsa';
import { fmcsaPageUrl } from '@/types/fmcsaPage';
import { orderDeliveries, orderDisplayNumber, orderPickups, stopPlaces } from '@/types/order';
import { CA_REVIEW_CHECKS } from '@/types/saRequest';
import {
  CARRIER_VETTINGS_COLLECTION,
  VETTING_PRINTS_SUBCOLLECTION,
  vettingFilePath,
  vettingHashInput,
  vettingLevel,
  type CarrierVetting,
  type VettingFile,
  type VettingPrint,
  type VettingTrigger,
} from '@/types/carrierVetting';

/**
 * Taking, listing and checking carrier vetting records — see
 * src/types/carrierVetting.ts for what one is and why it exists.
 */

function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function millis(v: unknown): number | null {
  const t = v as { toMillis?: () => number } | null | undefined;
  return typeof t?.toMillis === 'function' ? t.toMillis() : null;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function money(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

const htmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * FMCSA's answer for the record: asked now if at all possible. A stale
 * answer is the thing this record exists to replace, so the stored check is
 * only the fallback, and the record says which it is.
 */
async function fmcsaNow(carrier: FirebaseFirestore.DocumentData): Promise<{
  answer: FmcsaAnswer | null; source: CarrierVetting['fmcsaSource']; at: number | null; error: string;
}> {
  const dot = carrierNumber(carrier.dot);
  const mc  = carrierNumber(carrier.mc);
  let error = 'The carrier has no DOT or MC number.';
  if (dot || mc) {
    try {
      return { answer: await lookupCarrier(dot, mc), source: 'live', at: Date.now(), error: '' };
    } catch (e) {
      // Not the message of an unknown error: lib/fmcsa keeps the key out of
      // anything that could be shown, and this is printed on a PDF.
      error = e instanceof FmcsaUnavailableError || e instanceof FmcsaNotConfiguredError
        ? e.message : 'The FMCSA lookup failed.';
    }
  }
  const stored = carrier.fmcsa as (FmcsaAnswer & { checkedAt?: unknown; checkedByName?: unknown }) | undefined;
  if (stored && typeof stored === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { checkedAt, checkedByName: _n, ...answer } = stored;
    return { answer: answer as FmcsaAnswer, source: 'stored', at: millis(checkedAt), error };
  }
  return { answer: null, source: 'none', at: null, error };
}

/** The SaferWeb page as FMCSA served it to TTMS, saved beside the record. */
async function copySaferWeb(
  carrier: FirebaseFirestore.DocumentData,
  dotFromFmcsa: string,
  path: string,
  takenAt: number,
): Promise<VettingFile> {
  const url = fmcsaPageUrl('safer', carrierNumber(carrier.dot) || dotFromFmcsa, carrierNumber(carrier.mc));
  if (!url) throw new Error('The carrier has no DOT or MC number.');
  const page = await fetchFmcsaPage(url);
  // Says on the page itself what it is, so a copy opened on its own — printed,
  // attached to an email — still explains where it came from.
  const banner =
    `<div style="font:12px Arial,sans-serif;background:#fff7d6;border:1px solid #e8c95a;padding:8px 12px;margin:0 0 8px">`
    + `Copy of FMCSA SaferWeb kept by Total Transport Logistics as carrier vetting evidence. `
    + `Fetched ${htmlEscape(new Date(takenAt).toUTCString())} from ${htmlEscape(url)}. `
    + `Scripts were removed; the content is otherwise as FMCSA served it.</div>`;
  const html = /<body\b[^>]*>/i.test(page)
    ? page.replace(/<body\b[^>]*>/i, (m) => `${m}${banner}`)
    : `${banner}${page}`;
  const data = Buffer.from(html, 'utf8');
  await adminStorage.bucket().file(path).save(data, {
    contentType: 'text/html; charset=utf-8',
    resumable: false,
  });
  return { path, sha256: sha256(data), bytes: data.length, contentType: 'text/html; charset=utf-8', source: url };
}

/**
 * A copy of the certificate of insurance on the carrier. The carrier's own
 * copy is replaced when a new certificate arrives; this one is the one that
 * was on file when the carrier was hired.
 */
async function copyInsurance(source: string, orderId: string, vettingId: string): Promise<VettingFile> {
  const bucket = adminStorage.bucket();
  const from = bucket.file(source);
  const [[data], [meta]] = await Promise.all([from.download(), from.getMetadata()]);
  const ext = /\.[a-z0-9]{1,5}$/i.exec(source)?.[0] ?? '';
  const path = vettingFilePath(orderId, vettingId, `insurance-certificate${ext}`);
  const contentType = str(meta.contentType) || 'application/octet-stream';
  await bucket.file(path).save(data, { contentType, resumable: false });
  return { path, sha256: sha256(data), bytes: data.length, contentType, source };
}

/**
 * Takes a vetting record of the load's carrier now.
 *
 * Every part is gathered at once and none of them fails the whole: a record
 * missing the SaferWeb copy, and saying why, is far better than no record.
 * The one hard requirement is a carrier on the load.
 */
export async function takeCarrierVetting(opts: {
  orderId: string;
  order: Record<string, unknown>;
  actor: ChangeActor;
  trigger: VettingTrigger;
  dispatchVersion?: number | null;
}): Promise<CarrierVetting> {
  const { orderId, order, actor, trigger } = opts;
  const carrierId = str(order.carrierId);
  if (!carrierId) throw new Error('This load has no carrier.');
  const carrierSnap = await adminDb.collection('carriers').doc(carrierId).get();
  if (!carrierSnap.exists) throw new Error('The carrier on this load no longer exists.');
  const c = carrierSnap.data()!;

  const ref = adminDb.collection(CARRIER_VETTINGS_COLLECTION).doc();
  const takenAt = Date.now();
  const insurancePath = str(c.insuranceStoragePath);

  const [fmcsa, gate, reviewSnap] = await Promise.all([
    fmcsaNow(c),
    saGateFactsFor(orderId, order, c),
    requestRef('carrier', orderId).get(),
  ]);
  const [saferWeb, insurance] = await Promise.allSettled([
    copySaferWeb(c, fmcsa.answer?.dotNumber ?? '', vettingFilePath(orderId, ref.id, 'saferweb.html'), takenAt),
    insurancePath
      ? copyInsurance(insurancePath, orderId, ref.id)
      : Promise.reject(new Error('No certificate of insurance was on file for the carrier.')),
  ]);
  const why = (r: PromiseSettledResult<unknown>) =>
    r.status === 'rejected' ? (r.reason instanceof Error ? r.reason.message : 'Could not be copied.') : undefined;

  const review = reviewSnap.exists ? reviewSnap.data()! : null;
  const marks = (review?.checks ?? {}) as Record<string, { byName?: unknown; at?: unknown }>;

  const record: Omit<CarrierVetting, 'id' | 'hash'> = {
    orderId,
    orderNumber: orderDisplayNumber(order as { orderNumber?: string; batsId?: string }),
    carrierId,
    takenAt,
    takenByName: actor.name,
    takenByEmail: actor.email,
    trigger,
    dispatchVersion: opts.dispatchVersion ?? null,
    carrier: {
      name: str(c.companyName),
      dot: str(c.dot),
      mc: str(c.mc),
      phone: str(c.phone),
      email: str(c.email),
      address: str(c.address),
      contactName: str(c.contactName),
      dispatcher: str(c.dispatcher),
      dispatcherPhone: str(c.dispatcherPhone),
      insuranceProvider: str(c.insuranceProvider),
      insurancePolicyNumber: str(c.insurancePolicyNumber),
      insuranceExpiration: millis(c.insuranceExpiration),
      liabilityCoverage: money(c.insuranceCoverage),
      cargoCoverage: money(c.insuranceCargoCoverage),
    },
    fmcsa: fmcsa.answer,
    fmcsaSource: fmcsa.source,
    fmcsaAt: fmcsa.at,
    fmcsaError: fmcsa.error,
    concerns: fmcsa.answer ? fmcsaConcerns(fmcsa.answer, str(c.mc)) : [],
    operatingSince: operatingSince(fmcsa.answer?.registry as FmcsaRegistry | undefined),
    load: {
      pickup: stopPlaces(orderPickups(order as Parameters<typeof orderPickups>[0])) || '',
      delivery: stopPlaces(orderDeliveries(order as Parameters<typeof orderDeliveries>[0])) || '',
      pickupDate: millis(order.pickupDate),
      commodity: str(order.commodity),
      equipment: str(order.transportType),
      carrierPay: Number(order.carrierPay) || 0,
    },
    driver: {
      name: str(order.driverName),
      phone: str(order.driverPhone),
      licenseOnFile: gate.licenseOnFile,
      licenseExpiration: gate.licenseExpiration,
    },
    truckPhotos: gate.truckPhotos,
    review: review ? {
      status: str(review.status),
      checks: CA_REVIEW_CHECKS.map((k) => {
        const m = marks[k.key];
        return {
          key: k.key,
          label: k.label,
          byName: m ? str(m.byName) || 'Someone' : null,
          at: m && typeof m.at === 'number' ? m.at : null,
        };
      }),
    } : null,
    files: {
      saferWeb: saferWeb.status === 'fulfilled' ? saferWeb.value : null,
      insurance: insurance.status === 'fulfilled' ? insurance.value : null,
    },
    fileErrors: {
      ...(why(saferWeb) ? { saferWeb: why(saferWeb) } : {}),
      ...(why(insurance) ? { insurance: why(insurance) } : {}),
    },
  };

  // Round-tripped through JSON first so that what is hashed is exactly what
  // Firestore will hand back: no undefined, no class instances.
  const plain = JSON.parse(JSON.stringify(record)) as Omit<CarrierVetting, 'id' | 'hash'>;
  const hash = sha256(vettingHashInput(plain));
  // create(), not set(): a record is written once and never overwritten.
  await ref.create({ ...plain, hash });

  const level = vettingLevel(plain);
  const verdict = level === 'ok' ? 'no concerns from FMCSA'
    : level === 'bad' ? 'FMCSA showed a problem'
    : level === 'warn' ? 'FMCSA showed something to look at'
    : 'FMCSA could not be reached';
  await recordEvent(
    adminDb.collection('orders').doc(orderId),
    `Saved a carrier vetting record of ${plain.carrier.name || 'the carrier'} (${verdict})`,
    actor,
  ).catch(() => {});

  return { ...plain, id: ref.id, hash };
}

export function toCarrierVetting(id: string, d: FirebaseFirestore.DocumentData): CarrierVetting {
  return { ...(d as Omit<CarrierVetting, 'id'>), id };
}

/** Every record on a load, newest first. One equality filter; sorted here. */
export async function listCarrierVettings(orderId: string): Promise<CarrierVetting[]> {
  const snap = await adminDb.collection(CARRIER_VETTINGS_COLLECTION).where('orderId', '==', orderId).get();
  return snap.docs.map((d) => toCarrierVetting(d.id, d.data())).sort((a, b) => b.takenAt - a.takenAt);
}

/** One record, only if it belongs to this load — a record id alone opens nothing. */
export async function getCarrierVetting(orderId: string, vettingId: string): Promise<CarrierVetting | null> {
  const snap = await adminDb.collection(CARRIER_VETTINGS_COLLECTION).doc(vettingId).get();
  if (!snap.exists || snap.data()?.orderId !== orderId) return null;
  return toCarrierVetting(snap.id, snap.data()!);
}

function printsOf(vettingId: string) {
  return adminDb.collection(CARRIER_VETTINGS_COLLECTION).doc(vettingId).collection(VETTING_PRINTS_SUBCOLLECTION);
}

/** A fresh id for a print about to be drawn, so the PDF can carry it. */
export function newVettingPrintId(vettingId: string): string {
  return printsOf(vettingId).doc().id;
}

/**
 * Keeps a Carrier Selection File exactly as it is about to be handed out —
 * see VettingPrint. Throws when it cannot, and the caller then does not hand
 * it out: an unrecorded copy is the thing this exists to prevent.
 */
export async function keepVettingPrint(opts: {
  orderId: string;
  vettingId: string;
  printId: string;
  pdf: Buffer;
  printedAt: number;
  printedByName: string;
  printedByEmail: string;
  intact: VettingPrint['intact'];
}): Promise<VettingPrint> {
  const path = vettingFilePath(opts.orderId, opts.vettingId, `prints/${opts.printId}.pdf`);
  await adminStorage.bucket().file(path).save(opts.pdf, { contentType: 'application/pdf', resumable: false });
  const print: Omit<VettingPrint, 'id'> = {
    printedAt: opts.printedAt,
    printedByName: opts.printedByName,
    printedByEmail: opts.printedByEmail,
    path,
    sha256: sha256(opts.pdf),
    bytes: opts.pdf.length,
    intact: opts.intact,
  };
  // create(): a print, like the record, is written once.
  await printsOf(opts.vettingId).doc(opts.printId).create(print);
  return { ...print, id: opts.printId };
}

/** Every copy of one record ever handed out, newest first. */
export async function listVettingPrints(vettingId: string): Promise<VettingPrint[]> {
  const snap = await printsOf(vettingId).get();
  return snap.docs
    .map((d) => ({ ...(d.data() as Omit<VettingPrint, 'id'>), id: d.id }))
    .sort((a, b) => b.printedAt - a.printedAt);
}

export async function getVettingPrint(vettingId: string, printId: string): Promise<VettingPrint | null> {
  const snap = await printsOf(vettingId).doc(printId).get();
  return snap.exists ? { ...(snap.data() as Omit<VettingPrint, 'id'>), id: snap.id } : null;
}

/** Whether the record still reads as it did when it was written. */
export function vettingIntact(v: CarrierVetting): boolean {
  return sha256(vettingHashInput(v)) === v.hash;
}

/** Whether a copied file still has the bytes it was saved with. */
export async function vettingFileIntact(f: VettingFile): Promise<boolean> {
  try {
    const [data] = await adminStorage.bucket().file(f.path).download();
    return sha256(data) === f.sha256;
  } catch {
    return false;
  }
}
