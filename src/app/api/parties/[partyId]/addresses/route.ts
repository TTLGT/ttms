import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller, readParty } from '@/lib/partyAccess';
import { updatePartyAsCaller } from '@/lib/partyWrites';
import { actorOf, writeChange } from '@/lib/recordHistory';
import {
  MAX_LOCATION_LABEL, MAX_PARTY_ADDRESSES, MAIN_LOCATION_ID,
  addressIsBlank, addressLine, cleanAddress, newLocationId, sameAddress, savedLocations,
  type PartyLocation,
} from '@/types/partyAddress';
import type { Party } from '@/types/party';

type RouteContext = { params: Promise<{ partyId: string }> };

function fail(e: unknown) {
  if (e instanceof AdminAuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  throw e;
}

/**
 * Adds one address to a shipper or consignee — from an order, when the pickup
 * or delivery is somewhere the record did not have yet, or from the party's
 * own page.
 *
 * Open to anybody who may **use** the party, an approved access request
 * included, which is wider than the right to edit it (updatePartyAsCaller()
 * is strict). That is deliberate: an address on an order must belong to the
 * shipper or consignee at that stop, so a broker using somebody else's
 * shipper under an approval has to be able to add the dock they are sending
 * a truck to, or they cannot save the order at all. It only ever adds —
 * changing or removing an address is the PUT below, which is strict — and it
 * is written to the party's change log like any other edit.
 *
 * Answers with the location (an existing one when the address is already on
 * the record) and the whole saved list, so the form can refresh its copy.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { partyId } = await params;
    const caller = await requireCaller(req);
    const access = await readParty(caller, partyId);
    if (access.status === 'missing') throw new AdminAuthError('Party not found', 404);
    if (access.status === 'denied') throw new AdminAuthError('You do not have access to this record', 403);

    const body    = await req.json().catch(() => ({}));
    const address = cleanAddress(body.address);
    const label   = (typeof body.label === 'string' ? body.label.trim() : '').slice(0, MAX_LOCATION_LABEL);
    if (addressIsBlank(address) || !address.street || !address.city || !address.state) {
      throw new AdminAuthError('An address needs a street, a city and a state.', 400);
    }

    const ref = adminDb.collection('parties').doc(partyId);
    const result = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new AdminAuthError('Party not found', 404);
      const data = snap.data() as Partial<Party>;

      if (sameAddress(data.address, address)) {
        return { locationId: MAIN_LOCATION_ID, addresses: savedLocations(data) };
      }
      const current = savedLocations(data);
      const already = current.find((l) => sameAddress(l, address));
      if (already) return { locationId: already.id, addresses: current };
      if (current.length >= MAX_PARTY_ADDRESSES) {
        throw new AdminAuthError(`A record can hold at most ${MAX_PARTY_ADDRESSES} addresses.`, 409);
      }

      const added: PartyLocation = { id: newLocationId(), label, ...address };
      const next = [...current, added];
      const now = Timestamp.now();
      // Saving the list folds the old single-address fields into it, so they
      // are cleared in the same write — see savedLocations().
      tx.update(ref, { addresses: next, defaultOrigin: null, defaultDest: null, updatedAt: now });
      writeChange(tx, ref, {
        action:  'event',
        summary: `Added an address${label ? ` (${label})` : ''}: ${addressLine(address)}`,
      }, actorOf(caller), now);
      return { locationId: added.id, addresses: next };
    });

    return NextResponse.json(result);
  } catch (e) {
    return fail(e);
  }
}

/**
 * Replaces the saved list — relabelled, corrected, reordered or with one
 * taken out — from the party's own page. Strict: the same right as editing
 * the party's other details, through updatePartyAsCaller(), which also
 * writes the change log entry.
 *
 * Orders keep their own copy of the address they used, so correcting or
 * removing one here changes no paperwork that has already gone out.
 */
export async function PUT(req: NextRequest, { params }: RouteContext) {
  try {
    const { partyId } = await params;
    const caller = await requireCaller(req);
    const body   = await req.json().catch(() => ({}));
    if (!Array.isArray(body.addresses)) throw new AdminAuthError('addresses must be a list', 400);
    await updatePartyAsCaller(caller, partyId, { patch: { addresses: body.addresses } });
    const snap = await adminDb.collection('parties').doc(partyId).get();
    return NextResponse.json({ addresses: savedLocations(snap.data() as Partial<Party>) });
  } catch (e) {
    return fail(e);
  }
}
