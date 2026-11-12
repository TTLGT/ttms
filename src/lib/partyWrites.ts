/**
 * Editing a party (client, shipper, consignee), server-side, with its change
 * history. Creation was already a server route (POST /api/parties).
 *
 * Moved off the client SDK for the reason given in src/lib/orderWrites.ts:
 * the history has to be written in the same batch as the change, by
 * something the browser cannot skip. The rules now refuse client writes to
 * `parties`, so the checks they made are made here, and must stay equivalent:
 *
 *   rules                         here
 *   partyVisible()                canSeeParty() — strictly, with no approval
 *   ownershipUnchanged([...])     OWNERSHIP_FIELDS
 *   sourceUnchanged() ||          SOURCE_FIELDS + canEditSource()
 *     canEditSource()
 *
 * Strictly, as for orders: an approved access request lends a read of a
 * party and never lent the right to edit it. That is also why tagging a role
 * onto a party used under an approval fails, and why callers treat that as
 * best-effort.
 */

import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, AdminAuthError } from './firebase-admin';
import { can, canEditSource, canSeeParty } from './accessControl';
import { actorOf, diffFields, sameValue, writeChange } from './recordHistory';
import type { Caller } from './partyAccess';
import {
  PARTY_ROLES, cleanContacts, cleanUpdatePrefs, isPaymentTerms, partyPhoneKeys, toNameKey, type PartyRole,
} from '@/types/party';
import { phoneRegionOf } from './phone';
import { cleanPartyLocations, newLocationId, sameAddress } from '@/types/partyAddress';
import type { Address } from '@/types/order';
import { cleanWebLinks } from '@/types/webLinks';

const COL = 'parties';

/** Moved only through /api/parties/{id}/owners. */
const OWNERSHIP_FIELDS = ['assignedToUids', 'assignedToGroupIds', 'assignedToEmails', 'assignedToName'] as const;

const SOURCE_FIELDS = ['sourceId', 'sourceName'] as const;

/** Bookkeeping or derived; the server sets these itself. */
const IGNORED_FIELDS = ['id', 'createdAt', 'updatedAt', 'nameKey', 'phoneKeys', 'batsId'] as const;

export interface PartyEdit {
  patch?: Record<string, unknown>;
  /** A role this party has now been used in. Added, never replacing the others. */
  addRole?: string;
}

export async function updatePartyAsCaller(
  caller: Caller,
  partyId: string,
  edit: PartyEdit,
): Promise<void> {
  const ref  = adminDb.collection(COL).doc(partyId);
  const snap = await ref.get();
  if (!snap.exists) throw new AdminAuthError('Party not found', 404);
  const before = snap.data()!;

  if (!canSeeParty(before, caller.uid, caller.profile)) {
    throw new AdminAuthError('You do not have access to this record', 403);
  }

  const patch: Record<string, unknown> = { ...(edit.patch ?? {}) };
  for (const f of IGNORED_FIELDS) delete patch[f];

  const touched = (fields: readonly string[]) =>
    fields.filter((f) => f in patch && !sameValue(before[f], patch[f]));

  if (touched(OWNERSHIP_FIELDS).length) {
    throw new AdminAuthError('Owners are changed from the Owners panel, by an admin or dispatcher.', 403);
  }
  if (touched(SOURCE_FIELDS).length && !canEditSource(before, caller.uid, caller.profile)) {
    throw new AdminAuthError('Only an owner of this record can change its lead source.', 403);
  }

  if (edit.addRole !== undefined) {
    if (!PARTY_ROLES.includes(edit.addRole as PartyRole)) {
      throw new AdminAuthError('Unknown role', 400);
    }
    const roles = (Array.isArray(patch.roles) ? patch.roles : before.roles ?? []) as string[];
    patch.roles = roles.includes(edit.addRole) ? roles : [...roles, edit.addRole];
  }

  // The address list is checked the way /api/parties/{id}/addresses checks
  // it, so the generic edit cannot store a malformed one. Saving the list
  // folds in the two single-address fields it replaced, so they go with it.
  if ('addresses' in patch) {
    patch.addresses = cleanPartyLocations(patch.addresses, newLocationId)
      .filter((l) => !sameAddress(l, ('address' in patch ? patch.address : before.address) as Address));
    patch.defaultOrigin = null;
    patch.defaultDest   = null;
  }

  // Credit with our factoring company is a finance decision, not a detail a
  // broker keeps up to date — so marking or unmarking a credit client is
  // admin and finance only (orders.payments), whoever else may edit the record.
  if ('creditClient' in patch) {
    patch.creditClient = patch.creditClient === true;
    if (!sameValue(before.creditClient === true, patch.creditClient) && !can(caller.profile, 'orders.payments')) {
      throw new AdminAuthError('Only admin and finance can mark a credit client.', 403);
    }
  }

  // The 2026-11-11 client fields, stored only in their own shapes. The
  // contacts list in particular decides who gets the SA (saContactIndex()),
  // so it is never stored as whatever JSON the browser sent.
  if ('contacts' in patch) patch.contacts = cleanContacts(patch.contacts, newLocationId);
  if ('paymentTerms' in patch) patch.paymentTerms = isPaymentTerms(patch.paymentTerms) ? patch.paymentTerms : null;
  if ('updatePrefs' in patch) patch.updatePrefs = patch.updatePrefs === null ? null : cleanUpdatePrefs(patch.updatePrefs);
  // Drawn as a clickable href for everybody who opens the record, so only
  // http(s) addresses are ever stored — see safeWebUrl().
  if ('webLinks' in patch) patch.webLinks = cleanWebLinks(patch.webLinks);
  if ('billingNotes' in patch) patch.billingNotes = typeof patch.billingNotes === 'string' ? patch.billingNotes.trim().slice(0, 1000) : '';

  // A stored region is checked against the catalog, as POST /api/parties does:
  // an unknown string would key the number as though it were American.
  for (const f of ['phoneRegion', 'phone2Region'] as const) {
    if (f in patch) patch[f] = phoneRegionOf(patch[f]);
  }

  const fields = diffFields(before, patch);

  const after = { ...before, ...patch };
  const write: Record<string, unknown> = { ...patch };

  // Both keys are built from a pair of fields and a patch may carry one half
  // of either, so they are rebuilt from the record as it will be once saved.
  // A name or a phone changed without its key leaves the party findable only
  // under what it used to be — see nameKey and phoneKeys in the Schema Guide.
  if (['companyName', 'contactName'].some((f) => f in patch)) {
    const company = String(after.companyName ?? '').trim();
    const contact = String(after.contactName ?? '').trim();
    write.nameKey = toNameKey(company || contact);
  }
  if (['phone', 'phone2', 'phoneRegion', 'phone2Region'].some((f) => f in patch)) {
    write.phoneKeys = partyPhoneKeys({
      phone:        String(after.phone ?? ''),
      phone2:       String(after.phone2 ?? ''),
      phoneRegion:  after.phoneRegion,
      phone2Region: after.phone2Region,
    });
  }

  const now = Timestamp.now();
  write.updatedAt = now;

  const batch = adminDb.batch();
  // Written even when nothing recordable changed: the edit screen sends the
  // phones back unchanged precisely so that an imported record gets its
  // phoneKeys rebuilt on its first save. Only the history entry is skipped.
  batch.update(ref, write);
  if (fields.length) writeChange(batch, ref, { action: 'updated', fields }, actorOf(caller), now);
  await batch.commit();
}
