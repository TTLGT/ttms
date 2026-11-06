import { auth } from './firebase';
import type { ChangeEntry } from '@/types/recordHistory';
import type { Provider, ProviderPayment } from '@/types/provider';

/**
 * The 3rd-party provider directory and its payments, from the browser.
 * Everything goes through /api/providers — the collection is closed to the
 * client SDK. See src/types/provider.ts.
 */

async function token(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return user.getIdToken();
}

/** Raised when a provider of that name is already in the directory. */
export class ProviderExistsError extends Error {
  existingId: string;
  constructor(message: string, existingId: string) {
    super(message);
    this.name = 'ProviderExistsError';
    this.existingId = existingId;
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${await token()}`,
      ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 409 && data.existingId) throw new ProviderExistsError(data.error, data.existingId);
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

const base = (id: string) => `/api/providers/${encodeURIComponent(id)}`;

export async function listProviders(): Promise<Provider[]> {
  return (await call<{ providers: Provider[] }>('GET', '/api/providers')).providers ?? [];
}

export async function getProvider(id: string): Promise<Provider> {
  return (await call<{ provider: Provider }>('GET', base(id))).provider;
}

export type ProviderInput = Omit<Provider,
  'id' | 'nameKey' | 'paymentCount' | 'totalPaid' | 'lastPaidOn' | 'createdByUid' | 'createdByName' | 'createdAt' | 'updatedAt'>;

export async function createProvider(input: ProviderInput): Promise<Provider> {
  return (await call<{ provider: Provider }>('POST', '/api/providers', input)).provider;
}

export async function updateProvider(id: string, input: ProviderInput): Promise<Provider> {
  return (await call<{ provider: Provider }>('PATCH', base(id), input)).provider;
}

export async function listProviderHistory(id: string): Promise<ChangeEntry[]> {
  return (await call<{ entries: ChangeEntry[] }>('GET', `${base(id)}/history`)).entries ?? [];
}

export async function listProviderPayments(id: string): Promise<ProviderPayment[]> {
  return (await call<{ payments: ProviderPayment[] }>('GET', `${base(id)}/payments`)).payments ?? [];
}

export interface PaymentInput {
  amount: string;
  paidOn: string;
  method: string;
  reference: string;
  service: string;
  orderNumber: string;
  notes: string;
  receipts: File[];
}

/**
 * A receipt as it is sent: a picture shrunk to a JPEG first, because Vercel
 * refuses a request over 4.5 MB and a phone photo is often bigger than that;
 * a PDF as it is.
 */
async function prepared(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  const { prepareLoadPhoto } = await import('./imagePrep');
  const { photo } = await prepareLoadPhoto(file);
  return new File([photo], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}

async function receiptForm(files: File[], fields: Record<string, string> = {}): Promise<FormData> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  for (const f of files) form.append('receipts', await prepared(f));
  return form;
}

export async function recordProviderPayment(id: string, input: PaymentInput): Promise<ProviderPayment> {
  const { receipts, ...fields } = input;
  const form = await receiptForm(receipts, fields);
  return (await call<{ payment: ProviderPayment }>('POST', `${base(id)}/payments`, form)).payment;
}

export async function addPaymentReceipts(id: string, paymentId: string, files: File[]): Promise<void> {
  await call('POST', `${base(id)}/payments/${encodeURIComponent(paymentId)}`, await receiptForm(files));
}

export async function voidProviderPayment(id: string, paymentId: string, reason: string): Promise<void> {
  await call('PATCH', `${base(id)}/payments/${encodeURIComponent(paymentId)}`, { void: reason });
}
