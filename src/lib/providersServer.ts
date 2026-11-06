/**
 * 3rd-party providers and the payments made to them, server-side. See
 * src/types/provider.ts for what they are and who may do what; every route
 * under /api/providers comes through here.
 */

import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { adminDb, adminStorage, AdminAuthError } from './firebase-admin';
import { can } from './accessControl';
import { actorOf, diffFields, writeChange } from './recordHistory';
import { readOrderByNumber } from './orderAccess';
import type { Caller } from './partyAccess';
import { orderDisplayNumber } from '@/types/order';
import {
  MAX_RECEIPTS_PER_PAYMENT, MAX_RECEIPT_BYTES, PAYMENT_METHODS, PROVIDERS_COLLECTION,
  PROVIDER_PAYMENTS_SUBCOLLECTION, RECEIPT_TYPES, cleanProviderFields, isProviderService,
  providerNameKey, providerProblem, providerReceiptPath,
  type PaymentMethod, type Provider, type ProviderPayment, type ProviderReceipt,
} from '@/types/provider';

const col = () => adminDb.collection(PROVIDERS_COLLECTION);

/** Enough for a company directory; past this the list wants paging. */
const LIST_LIMIT = 2000;

function newId(): string {
  return col().doc().id.slice(0, 12);
}

/** Adding, editing and paying providers: the people who book them. */
export function assertMayWork(caller: Caller): void {
  if (!can(caller.profile, 'orders.view')) {
    throw new AdminAuthError('Interns can look providers up but not change them or record payments.', 403);
  }
}

export function toProvider(id: string, d: FirebaseFirestore.DocumentData): Provider {
  return {
    id,
    companyName:  d.companyName ?? '',
    nameKey:      d.nameKey ?? '',
    services:     Array.isArray(d.services) ? d.services.filter(isProviderService) : [],
    serviceNote:  d.serviceNote ?? '',
    contactName:  d.contactName ?? '',
    phone:        d.phone ?? '',
    phoneRegion:  d.phoneRegion,
    phone2:       d.phone2 ?? '',
    phone2Region: d.phone2Region,
    email:        d.email ?? '',
    website:      d.website ?? '',
    address:      d.address ?? { street: '', city: '', state: '', zip: '', country: 'US' },
    serviceArea:  d.serviceArea ?? '',
    rates:        Array.isArray(d.rates) ? d.rates : [],
    notes:        d.notes ?? '',
    paymentCount: Number(d.paymentCount) || 0,
    totalPaid:    Number(d.totalPaid) || 0,
    lastPaidOn:   d.lastPaidOn ?? null,
    createdByUid:  d.createdByUid ?? '',
    createdByName: d.createdByName ?? '',
    createdAt:    d.createdAt ?? null,
    updatedAt:    d.updatedAt ?? null,
  };
}

export async function listProviders(): Promise<Provider[]> {
  const snap = await col().orderBy('nameKey').limit(LIST_LIMIT).get();
  return snap.docs.map((d) => toProvider(d.id, d.data()));
}

export async function getProvider(id: string): Promise<Provider> {
  const snap = await col().doc(id).get();
  if (!snap.exists) throw new AdminAuthError('Provider not found', 404);
  return toProvider(snap.id, snap.data()!);
}

/**
 * Adds a provider. A second one under the same name is refused with the
 * first one's id, so the directory does not grow two copies of one crew —
 * the form offers to open the one already there.
 */
export async function createProvider(caller: Caller, raw: unknown): Promise<Provider> {
  assertMayWork(caller);
  const fields = cleanProviderFields(raw, newId);
  const problem = providerProblem(fields);
  if (problem) throw new AdminAuthError(problem, 400);
  const nameKey = providerNameKey(fields.companyName);

  const dupe = await col().where('nameKey', '==', nameKey).limit(1).get();
  if (!dupe.empty) {
    const err = new AdminAuthError(`${fields.companyName} is already in the directory.`, 409);
    (err as AdminAuthError & { existingId?: string }).existingId = dupe.docs[0].id;
    throw err;
  }

  const ref = col().doc();
  const now = Timestamp.now();
  const record = {
    ...fields,
    nameKey,
    paymentCount: 0,
    totalPaid:    0,
    lastPaidOn:   null,
    createdByUid:  caller.uid,
    createdByName: caller.displayName,
    createdAt:    now,
    updatedAt:    now,
  };
  const batch = adminDb.batch();
  batch.set(ref, record);
  writeChange(batch, ref, { action: 'created', summary: `Added ${fields.companyName} to the directory` }, actorOf(caller), now);
  await batch.commit();
  return toProvider(ref.id, record);
}

/** Saves the editable fields, recording what changed. The payment totals are the payment routes' alone. */
export async function updateProvider(caller: Caller, id: string, raw: unknown): Promise<Provider> {
  assertMayWork(caller);
  const ref = col().doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new AdminAuthError('Provider not found', 404);
  const before = snap.data()!;

  const fields = cleanProviderFields(raw, newId);
  const problem = providerProblem(fields);
  if (problem) throw new AdminAuthError(problem, 400);
  const nameKey = providerNameKey(fields.companyName);
  if (nameKey !== before.nameKey) {
    const dupe = await col().where('nameKey', '==', nameKey).limit(1).get();
    if (!dupe.empty && dupe.docs[0].id !== id) {
      throw new AdminAuthError(`Another provider is already called ${fields.companyName}.`, 409);
    }
  }

  const patch: Record<string, unknown> = { ...fields, nameKey };
  const changed = diffFields(before, patch).filter((f) => f.field !== 'nameKey');
  const now = Timestamp.now();
  const batch = adminDb.batch();
  batch.update(ref, { ...patch, updatedAt: now });
  if (changed.length) writeChange(batch, ref, { action: 'updated', fields: changed }, actorOf(caller), now);
  await batch.commit();
  return toProvider(id, { ...before, ...patch, updatedAt: now });
}

// ─── Payments ───────────────────────────────────────────────────────────────

function stableExpiry(): number {
  const hour = 60 * 60 * 1000;
  return (Math.floor(Date.now() / hour) + 3) * hour;
}

function toPayment(id: string, d: FirebaseFirestore.DocumentData): ProviderPayment {
  return {
    id,
    amount:        Number(d.amount) || 0,
    paidOn:        d.paidOn ?? '',
    method:        d.method ?? 'other',
    reference:     d.reference ?? '',
    service:       isProviderService(d.service) ? d.service : null,
    orderId:       d.orderId ?? null,
    orderNumber:   d.orderNumber ?? '',
    notes:         d.notes ?? '',
    receipts:      Array.isArray(d.receipts) ? d.receipts : [],
    recordedByUid:  d.recordedByUid ?? '',
    recordedByName: d.recordedByName ?? '',
    createdAt:     d.createdAt ?? null,
    voidedAt:      d.voidedAt ?? null,
    voidedByUid:   d.voidedByUid ?? null,
    voidedByName:  d.voidedByName ?? null,
    voidReason:    d.voidReason ?? null,
  };
}

/** Every payment to one provider, newest first, each receipt with a signed link. */
export async function listPayments(caller: Caller, providerId: string): Promise<ProviderPayment[]> {
  assertMayWork(caller);
  const snap = await col().doc(providerId).collection(PROVIDER_PAYMENTS_SUBCOLLECTION)
    .orderBy('paidOn', 'desc').limit(500).get();
  const bucket = adminStorage.bucket();
  return Promise.all(snap.docs.map(async (doc) => {
    const p = toPayment(doc.id, doc.data());
    p.receipts = await Promise.all(p.receipts.map(async (r) => {
      const [url] = await bucket.file(providerReceiptPath(providerId, doc.id, r.id))
        .getSignedUrl({ action: 'read', expires: stableExpiry() })
        .catch(() => ['']);
      return { ...r, url };
    }));
    return p;
  }));
}

/** The files on a form, checked for type and size before anything is stored. */
function receiptFiles(form: FormData | null): File[] {
  const files = (form?.getAll('receipts') ?? []).filter((f): f is File => typeof f === 'object' && f !== null && 'arrayBuffer' in f);
  if (files.length > MAX_RECEIPTS_PER_PAYMENT) {
    throw new AdminAuthError(`At most ${MAX_RECEIPTS_PER_PAYMENT} receipts on one payment`, 400);
  }
  for (const f of files) {
    if (!(RECEIPT_TYPES as readonly string[]).includes(f.type)) {
      throw new AdminAuthError(`${f.name} is not a picture or a PDF`, 415);
    }
    if (f.size > MAX_RECEIPT_BYTES) {
      throw new AdminAuthError(`${f.name} is larger than 4 MB. Pictures are shrunk for you; a PDF this large needs saving smaller.`, 413);
    }
  }
  return files;
}

/** Stores the files in the bucket under names built here. The caller records them. */
async function saveReceipts(caller: Caller, providerId: string, paymentId: string, files: File[]): Promise<ProviderReceipt[]> {
  const bucket = adminStorage.bucket();
  const now = Timestamp.now();
  return Promise.all(files.map(async (f) => {
    const id = newId();
    await bucket.file(providerReceiptPath(providerId, paymentId, id)).save(Buffer.from(await f.arrayBuffer()), {
      metadata: { contentType: f.type, cacheControl: 'private, max-age=86400' },
      resumable: false,
    });
    return {
      id,
      name: (f.name || 'receipt').slice(0, 120),
      contentType: f.type,
      size: f.size,
      uploadedByUid: caller.uid,
      uploadedByName: caller.displayName,
      uploadedAt: now,
    };
  }));
}

async function dropReceipts(providerId: string, paymentId: string, receipts: ProviderReceipt[]): Promise<void> {
  const bucket = adminStorage.bucket();
  await Promise.all(receipts.map((r) =>
    bucket.file(providerReceiptPath(providerId, paymentId, r.id)).delete({ ignoreNotFound: true }).catch(() => {})));
}

const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

/**
 * Records a payment to a provider, with any receipts sent beside it. The
 * provider's running totals move in the same transaction, and a line goes on
 * its change log — and on the load's, when the payment names one the caller
 * can open, so a lumper paid for a load is on the load's history too.
 */
export async function createPayment(caller: Caller, providerId: string, form: FormData | null): Promise<ProviderPayment> {
  assertMayWork(caller);
  const get = (k: string) => String(form?.get(k) ?? '').trim();

  const amount = Math.round(Number(get('amount').replace(/[$,]/g, '')) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new AdminAuthError('Enter the amount paid.', 400);
  if (amount > 1_000_000) throw new AdminAuthError('That amount looks wrong — check the decimal point.', 400);
  const paidOn = get('paidOn');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) throw new AdminAuthError('Enter the day it was paid.', 400);
  const methodRaw = get('method');
  const method: PaymentMethod = (PAYMENT_METHODS as string[]).includes(methodRaw) ? methodRaw as PaymentMethod : 'other';
  const serviceRaw = get('service');
  const service = isProviderService(serviceRaw) ? serviceRaw : null;

  // The load, by its number. Linked only when the caller can open it; a
  // number they cannot see is kept as typed and links nothing, which says
  // no more than they typed.
  const typedNumber = get('orderNumber').slice(0, 40);
  let orderId: string | null = null;
  let orderNumber = typedNumber;
  if (typedNumber) {
    const access = await readOrderByNumber(caller, typedNumber);
    if (access.status === 'ok') {
      orderId = String(access.order.id);
      orderNumber = orderDisplayNumber(access.order as { orderNumber?: string; batsId?: string }) || typedNumber;
    }
  }

  const files = receiptFiles(form);
  const providerRef = col().doc(providerId);
  const ref = providerRef.collection(PROVIDER_PAYMENTS_SUBCOLLECTION).doc();
  const receipts = await saveReceipts(caller, providerId, ref.id, files);
  const now = Timestamp.now();

  const record = {
    amount, paidOn, method,
    reference: get('reference').slice(0, 80),
    service, orderId, orderNumber,
    notes: get('notes').slice(0, 1000),
    receipts,
    recordedByUid: caller.uid,
    recordedByName: caller.displayName,
    createdAt: now,
    voidedAt: null, voidedByUid: null, voidedByName: null, voidReason: null,
  };

  try {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(providerRef);
      if (!snap.exists) throw new AdminAuthError('Provider not found', 404);
      const last = snap.data()!.lastPaidOn as string | null;
      tx.set(ref, record);
      tx.update(providerRef, {
        paymentCount: FieldValue.increment(1),
        totalPaid:    FieldValue.increment(amount),
        lastPaidOn:   !last || paidOn > last ? paidOn : last,
      });
      const what = `Recorded a payment of ${usd(amount)} on ${paidOn}${orderNumber ? ` for load ${orderNumber}` : ''}`
        + `${receipts.length ? ` with ${receipts.length} receipt${receipts.length === 1 ? '' : 's'}` : ''}`;
      writeChange(tx, providerRef, { action: 'event', summary: what }, actorOf(caller), now);
      if (orderId) {
        writeChange(tx, adminDb.collection('orders').doc(orderId), {
          action: 'event',
          summary: `Paid ${snap.data()!.companyName ?? 'a 3rd-party provider'} ${usd(amount)} (3rd-party provider)`,
        }, actorOf(caller), now);
      }
    });
  } catch (e) {
    // Nothing points at the files yet; leaving them would be storage nobody can reach.
    await dropReceipts(providerId, ref.id, receipts);
    throw e;
  }
  return toPayment(ref.id, record);
}

/** Adds receipts to a payment already recorded — the paper often arrives after the money. */
export async function addReceipts(caller: Caller, providerId: string, paymentId: string, form: FormData | null): Promise<void> {
  assertMayWork(caller);
  const files = receiptFiles(form);
  if (!files.length) throw new AdminAuthError('Choose a receipt to add.', 400);
  const providerRef = col().doc(providerId);
  const ref = providerRef.collection(PROVIDER_PAYMENTS_SUBCOLLECTION).doc(paymentId);
  const receipts = await saveReceipts(caller, providerId, paymentId, files);
  try {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new AdminAuthError('Payment not found', 404);
      const have = Array.isArray(snap.data()!.receipts) ? snap.data()!.receipts : [];
      if (have.length + receipts.length > MAX_RECEIPTS_PER_PAYMENT) {
        throw new AdminAuthError(`At most ${MAX_RECEIPTS_PER_PAYMENT} receipts on one payment`, 400);
      }
      tx.update(ref, { receipts: [...have, ...receipts] });
      writeChange(tx, providerRef, {
        action: 'event',
        summary: `Added ${receipts.length} receipt${receipts.length === 1 ? '' : 's'} to the payment of ${usd(Number(snap.data()!.amount) || 0)} on ${snap.data()!.paidOn}`,
      }, actorOf(caller));
    });
  } catch (e) {
    await dropReceipts(providerId, paymentId, receipts);
    throw e;
  }
}

/**
 * Voids a payment recorded by mistake. Kept, struck through, with who and
 * why — a payment record that can vanish is not a record — and taken out of
 * the provider's totals. Admin and finance only (`orders.payments`).
 */
export async function voidPayment(caller: Caller, providerId: string, paymentId: string, reasonRaw: unknown): Promise<void> {
  if (!can(caller.profile, 'orders.payments')) {
    throw new AdminAuthError('Only admin and finance can void a payment.', 403);
  }
  const reason = (typeof reasonRaw === 'string' ? reasonRaw.trim() : '').slice(0, 300);
  if (!reason) throw new AdminAuthError('Say why it is being voided.', 400);
  const providerRef = col().doc(providerId);
  const ref = providerRef.collection(PROVIDER_PAYMENTS_SUBCOLLECTION).doc(paymentId);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new AdminAuthError('Payment not found', 404);
    const d = snap.data()!;
    if (d.voidedAt) throw new AdminAuthError('That payment is already voided.', 409);
    const now = Timestamp.now();
    tx.update(ref, { voidedAt: now, voidedByUid: caller.uid, voidedByName: caller.displayName, voidReason: reason });
    tx.update(providerRef, {
      paymentCount: FieldValue.increment(-1),
      totalPaid:    FieldValue.increment(-(Number(d.amount) || 0)),
    });
    writeChange(tx, providerRef, {
      action: 'event',
      summary: `Voided the payment of ${usd(Number(d.amount) || 0)} on ${d.paidOn}: ${reason}`,
    }, actorOf(caller), now);
  });
}
