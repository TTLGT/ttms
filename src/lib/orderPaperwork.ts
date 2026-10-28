'use client';

import { auth } from './firebase';
import type { ReadinessItem } from '@/types/orderReadiness';
import type { OrderFile } from '@/types/orderFile';
import type { SignatureDetails } from '@/types/signatureRecord';
import type { CarrierLookup, SignedDocumentRow } from '@/types/signedDocument';

/**
 * The browser's side of an order's paperwork before it goes out: what is still
 * missing, and the quote PDF. See src/types/orderReadiness.ts.
 */

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

export async function fetchOrderReadiness(orderId: string): Promise<ReadinessItem[]> {
  const res = await fetch(`/api/orders/${orderId}/readiness`, { headers: await authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Could not check the order');
  return (data as { items: ReadinessItem[] }).items;
}

/**
 * Builds the quote PDF and saves it. Fetched with the ID token and handed to
 * the browser as a file, because a plain link cannot carry the Authorization
 * header and the route will not answer without it.
 */
export async function downloadQuotePdf(orderId: string, fallbackName: string): Promise<void> {
  const res = await fetch(`/api/orders/${orderId}/quote-pdf`, { headers: await authHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? 'Could not build the quote');
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** One version of the client's Shipper Agreement on a load. See src/lib/signedAgreements.ts. */
export interface AgreementVersion {
  ref: string;
  version: number;
  sentAt: number | null;
  sentTo: string;
  signed: { name: string; title: string; at: number; device: string } | null;
  supersededAt: number | null;
  current: boolean;
  revoked: boolean;
}

export async function listAgreementVersions(orderId: string, party: 'client' | 'carrier' = 'client'): Promise<AgreementVersion[]> {
  const res = await fetch(`/api/orders/${orderId}/agreements?party=${party}`, { headers: await authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Could not load the versions');
  return (data as { versions: AgreementVersion[] }).versions;
}

/**
 * Saves one version of the SA as a PDF — `ref` from the list, or none for
 * the newest signed one. Fetched with the ID token, like the quote.
 */
/** One agreement PDF as a file: the same render for downloading and for previewing. */
async function fetchAgreementPdf(orderId: string, ref: string | undefined, party: 'client' | 'carrier'): Promise<{ blob: Blob; name: string }> {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : `?party=${party}`;
  const res = await fetch(`/api/orders/${orderId}/agreements/pdf${q}`, { headers: await authHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? 'Could not build the PDF');
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'Shipper Agreement.pdf';
  return { blob, name };
}

export async function downloadAgreementPdf(orderId: string, ref?: string, party: 'client' | 'carrier' = 'client'): Promise<void> {
  const { blob, name } = await fetchAgreementPdf(orderId, ref, party);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * The same PDF as a `blob:` URL to show on screen. The caller revokes it when
 * the preview closes. Typed as a PDF explicitly so the browser's own viewer
 * draws it rather than offering it as a download.
 */
export async function previewAgreementPdf(orderId: string, ref?: string, party: 'client' | 'carrier' = 'client'): Promise<{ url: string; name: string }> {
  const { blob, name } = await fetchAgreementPdf(orderId, ref, party);
  return { url: URL.createObjectURL(new Blob([blob], { type: 'application/pdf' })), name };
}

/** How many verified signed-SA copies the load holds, and how many wait. See src/lib/signedSaProof.ts. */
export async function fetchSignedSaProof(orderId: string, party: 'client' | 'carrier' = 'client'): Promise<{ files: number; photos: number; pending: number }> {
  const res = await fetch(`/api/orders/${orderId}/signed-sa-proof?party=${party}`, { headers: await authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Could not check for a signed Shipper Agreement (SA)');
  return data as { files: number; photos: number; pending: number };
}

/**
 * The signature details of a signed copy, and the decision on it. See
 * /api/orders/{id}/files/{fileId}/signature and src/types/signatureRecord.ts.
 * `advanceError` is set when the approval stood but the status move after it
 * was refused.
 */
export async function submitSignedCopy(
  orderId: string,
  fileId: string,
  body:
    | { action: 'save'; details: SignatureDetails }
    | { action: 'approve'; details?: SignatureDetails; advance?: boolean }
    | { action: 'reject'; reason: string },
): Promise<{ file: OrderFile; advanceError: string }> {
  const res = await fetch(`/api/orders/${orderId}/files/${fileId}/signature`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Could not save it');
  return data as { file: OrderFile; advanceError: string };
}

/** The signed copies on the Approvals screen. See /api/signed-documents. */
export async function listSignedDocuments(): Promise<{ rows: SignedDocumentRow[]; isVerifier: boolean }> {
  const res = await fetch('/api/signed-documents', { headers: await authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Could not load the signed copies');
  return data as { rows: SignedDocumentRow[]; isVerifier: boolean };
}

/** Switches the Record import label on a load. Admin and dispatch. */
export async function setRecordImport(orderId: string, on: boolean): Promise<{ recordImport: boolean; changedAt: number; changedByName: string }> {
  const res = await fetch(`/api/orders/${orderId}/record-import`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ on }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Could not change the label');
  return data as { recordImport: boolean; changedAt: number; changedByName: string };
}

/**
 * Emails the client that their acceptance is registered, with the uploaded
 * signed SA attached. See /api/orders/{id}/signed-sa-confirmation.
 */
export async function sendSignedSaConfirmation(
  orderId: string, party: 'client' | 'carrier' = 'client',
): Promise<{ sentTo: string; cc: string[]; at: number }> {
  const res = await fetch(`/api/orders/${orderId}/signed-sa-confirmation`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ party }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Could not send the confirmation');
  return data as { sentTo: string; cc: string[]; at: number };
}

/**
 * Who the carrier on a signed dispatch sheet is: what the sheet names, the
 * matching carriers already in TTMS, and FMCSA's companies under that name
 * when nothing here matches. See /api/orders/{id}/files/{fileId}/carrier.
 */
export async function lookupSignedCopyCarrier(orderId: string, fileId: string): Promise<CarrierLookup> {
  const res = await fetch(`/api/orders/${orderId}/files/${fileId}/carrier`, { headers: await authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Could not look the carrier up');
  return data as CarrierLookup;
}
