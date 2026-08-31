import { NextRequest, NextResponse } from 'next/server';
import { adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { canSeeOrder } from '@/lib/accessControl';
import { resolveOwnerContacts } from '@/lib/orderAccess';
import { orderAltNumber, orderDisplayNumber } from '@/types/order';
import type { LicenseDocumentRow } from '@/types/orderDocument';

/**
 * Every driver's licence in the company, whether or not the reader owns the load.
 *
 * This is the one listing that deliberately reaches past order visibility, and
 * it is the counterpart of the licence exemption in
 * src/types/orderDocument.ts: a licence is checked at pickup, at delivery and
 * by whoever is covering the phones, none of whom is necessarily on the load.
 * A file everyone may open is no use if only its owner can find it.
 *
 * What it does NOT do is leak the load along with it. For an order the caller
 * cannot see, the row carries no shipper, no client, no rate and no dates —
 * only the number, the licence, and who to go and ask. Everything else about
 * the order stays behind canSeeOrder() exactly as it was.
 *
 * Rows are built here rather than handing back order documents, so there is no
 * field on the wire that was not chosen. Widening SELECTED_FIELDS is the point
 * at which somebody has to decide whether the withheld half should stay withheld.
 */
const SELECTED_FIELDS = [
  'orderNumber', 'batsId', 'previousOrderNumber',
  'shipperName', 'driverLicenseStoragePath',
  'assignedToUids', 'assignedToGroupIds', 'assignedToEmails',
  'clientOwnerUids', 'clientOwnerGroupIds',
] as const;

/**
 * Capped because this cannot be cursor-paged the way the order list is: the
 * inequality below has to be the first sort key, which rules out the createdAt
 * cursor. A licence is the exception among orders rather than the rule, so the
 * ceiling is a guard against the collection growing into an unbounded read,
 * not a page size anybody is expected to hit.
 */
const MAX_ROWS = 2000;

export async function GET(req: NextRequest) {
  try {
    const caller = await requireCaller(req);

    // `!= null` rather than `> ''`, matching listVisibleOrdersPage: the field
    // is written as null when there is no file, and an inequality also excludes
    // orders missing it entirely — which is what "has a licence" should mean.
    const snap = await adminDb.collection('orders')
      .where('driverLicenseStoragePath', '!=', null)
      .orderBy('driverLicenseStoragePath', 'desc')
      .select(...SELECTED_FIELDS)
      .limit(MAX_ROWS)
      .get();

    const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() }));

    // Only the withheld rows need an owner looked up. On a broker's screen
    // that is most of them; on an admin's it is none.
    const hidden   = docs.filter((d) => !canSeeOrder(d.data, caller.uid, caller.profile));
    const contacts = await resolveOwnerContacts(hidden);

    const rows: LicenseDocumentRow[] = docs.map(({ id, data }) => {
      const visible = !contacts.has(id);
      return {
        orderId:     id,
        orderNumber: orderDisplayNumber(data),
        altNumber:   orderAltNumber(data),
        // The shipper is the load, not the licence. Withheld together with
        // everything else about an order the caller has no access to.
        shipperName: visible ? (data.shipperName ?? '') : null,
        owner:       visible ? null : contacts.get(id) ?? null,
      };
    });

    return NextResponse.json({ rows });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
