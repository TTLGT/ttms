import { NextRequest, NextResponse } from 'next/server';
import { adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { can } from '@/lib/accessControl';
import { visibleLoadsByCarrier } from '@/lib/orderAccess';
import type { CarrierCoiRow } from '@/types/orderDocument';

/**
 * The certificates of insurance behind the caller's own loads.
 *
 * A certificate lives on the carrier, not the order, so this starts from the
 * carriers that have one on file and keeps those hauling at least one load the
 * caller can see. Visibility is the ordinary order visibility — see
 * visibleLoadsByCarrier — so a broker sees the carriers on their book and an
 * admin sees every carrier that has hauled anything.
 *
 * Nothing here is wider than what the caller could already reach: the carrier
 * fields below are on the Carriers screen, and `carrier-insurance/` is readable
 * by any staff account but an intern (storage.rules). What the route adds is
 * the pairing with loads, and that half goes through the order choke point.
 */
const CARRIER_FIELDS = [
  'companyName', 'mc', 'dot',
  'insuranceProvider', 'insurancePolicyNumber', 'insuranceExpiration',
  'insuranceStoragePath',
] as const;

export async function GET(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    if (!can(caller.profile, 'documents.view') || caller.profile.isIntern) {
      return NextResponse.json({ rows: [] });
    }

    // `!= null` for the same reason as the licence list: the field is null
    // after a certificate is removed and absent on every imported carrier, and
    // the inequality excludes both. Carriers are a small collection, so this is
    // bounded by nature rather than by a limit.
    const snap = await adminDb.collection('carriers')
      .where('insuranceStoragePath', '!=', null)
      .select(...CARRIER_FIELDS)
      .get();

    const loads = await visibleLoadsByCarrier(caller, snap.docs.map((d) => d.id));

    const rows: CarrierCoiRow[] = snap.docs
      .filter((d) => loads.has(d.id) && d.get('insuranceStoragePath'))
      .map((d) => {
        const c = d.data();
        const l = loads.get(d.id)!;
        return {
          carrierId:             d.id,
          companyName:           c.companyName ?? '',
          mc:                    c.mc ?? '',
          dot:                   c.dot ?? '',
          insuranceProvider:     c.insuranceProvider ?? '',
          insurancePolicyNumber: c.insurancePolicyNumber ?? '',
          insuranceExpiration:   typeof c.insuranceExpiration?.toMillis === 'function'
            ? c.insuranceExpiration.toMillis()
            : null,
          insuranceStoragePath:  c.insuranceStoragePath,
          loadCount:             l.count,
          loads:                 l.loads,
        };
      })
      .sort((a, b) => a.companyName.localeCompare(b.companyName));

    return NextResponse.json({ rows });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
