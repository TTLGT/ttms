import { requestGET, requestPATCH, requestPOST } from '@/lib/agreementRequestRoutes';

/**
 * The Shipper Agreement request on one order. The handlers are shared with
 * the Carrier Agreement's (ca-request) — see src/lib/agreementRequestRoutes.ts.
 */
export const GET = requestGET('client');
export const POST = requestPOST('client');
export const PATCH = requestPATCH('client');
