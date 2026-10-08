/**
 * Creating and editing carriers, server-side, with their change history.
 *
 * Moved off the client SDK for the reason given in src/lib/orderWrites.ts.
 * The rules now refuse client writes to `carriers`; the checks they made are
 * made here and must stay equivalent:
 *
 *   rules                              here
 *   can('carriers.edit')               requirePermission(req, 'carriers.edit') in the route
 *   `fmcsa` never written by a save    refused below — only POST
 *                                      /api/carriers/{id}/fmcsa records it
 *
 * Reads stay on the client SDK (see src/lib/carriers.ts): a carrier is not an
 * owned record, so there is no visibility union for a server to work out.
 */

import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, AdminAuthError } from './firebase-admin';
import { diffFields, writeChange, type ChangeActor } from './recordHistory';
import { carrierNameKey, carrierNumber } from '@/types/carrier';

const COL = 'carriers';

const IGNORED_FIELDS = ['id', 'createdAt', 'updatedAt', 'nameKey'] as const;

function clean(raw: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = { ...raw };
  for (const f of IGNORED_FIELDS) delete patch[f];
  if ('fmcsa' in patch) {
    throw new AdminAuthError("FMCSA's answer is recorded by the Check FMCSA button, not by an edit.", 403);
  }
  // Digits only, so the number search can find it. See carrierNumber. Only
  // when sent: normalising an absent key would blank it.
  if ('mc' in patch)  patch.mc  = carrierNumber(String(patch.mc ?? ''));
  if ('dot' in patch) patch.dot = carrierNumber(String(patch.dot ?? ''));
  return patch;
}

export async function createCarrierAs(actor: ChangeActor, data: Record<string, unknown>): Promise<string> {
  const record = clean(data);
  const now = Timestamp.now();
  // Written on every save so search keeps working. See carrierNameKey.
  record.nameKey   = carrierNameKey(String(record.companyName ?? ''));
  record.createdAt = now;
  record.updatedAt = now;

  const ref = adminDb.collection(COL).doc();
  const batch = adminDb.batch();
  batch.set(ref, record);
  writeChange(batch, ref, { action: 'created', summary: `Created ${record.companyName || 'carrier'}` }, actor, now);
  await batch.commit();
  return ref.id;
}

export async function updateCarrierAs(
  actor: ChangeActor,
  carrierId: string,
  raw: Record<string, unknown>,
): Promise<void> {
  const ref  = adminDb.collection(COL).doc(carrierId);
  const snap = await ref.get();
  if (!snap.exists) throw new AdminAuthError('Carrier not found', 404);

  const patch  = clean(raw);
  const fields = diffFields(snap.data()!, patch);
  if (!fields.length) return;

  const now = Timestamp.now();
  const write: Record<string, unknown> = { ...patch, updatedAt: now };
  // Only when the name changed — writing it unconditionally would blank the
  // key on every edit that does not touch companyName.
  if ('companyName' in patch) write.nameKey = carrierNameKey(String(patch.companyName ?? ''));

  const batch = adminDb.batch();
  batch.update(ref, write);
  writeChange(batch, ref, { action: 'updated', fields }, actor, now);
  await batch.commit();
}
