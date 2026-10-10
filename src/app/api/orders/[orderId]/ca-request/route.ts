import { requestGET, requestPATCH, requestPOST } from '@/lib/agreementRequestRoutes';

/**
 * The Carrier Agreement request on one order: a broker asks once a carrier is
 * on the load, dispatch works the carrier checklist and sends it. The
 * handlers are shared with the Shipper Agreement's (sa-request) — see
 * src/lib/agreementRequestRoutes.ts.
 */
export const GET = requestGET('carrier');
export const POST = requestPOST('carrier');
export const PATCH = requestPATCH('carrier');
