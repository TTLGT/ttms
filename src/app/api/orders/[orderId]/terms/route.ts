import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller, type Caller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { actorOf } from '@/lib/recordHistory';
import { currentTerms } from '@/lib/agreementTermsServer';
import {
  applyOrderTerms, canApproveTerms, canEditTerms, cleanReason, fileTermsRequest, serializeRequest, termsRequests,
} from '@/lib/termsChangeServer';
import { orderTermsOf, validateTerms, type TermsParty } from '@/types/agreementTerms';

type RouteContext = { params: Promise<{ orderId: string }> };

/**
 * One load's own terms and conditions — for its client SA and its carrier
 * Dispatch Sheet, replacing the general ones on this load and no other. See
 * `ORDER_TERMS_FIELD` in src/types/agreementTerms.ts.
 *
 * Same people as the Settings panel (`agreementTerms.manage`), and only on a
 * load they can see. An approver's change applies at once; anybody else's
 * becomes a request for an admin and the load is unchanged until then.
 */
const PARTIES: TermsParty[] = ['client', 'carrier'];

async function editor(req: NextRequest, orderId: string): Promise<{ caller: Caller; order: Record<string, unknown> }> {
  const caller = await requireCaller(req);
  if (!canEditTerms(caller)) throw new AdminAuthError('You do not have permission to edit the agreement terms.', 403);
  const order = await getVisibleOrder(caller, orderId);
  return { caller, order };
}

function deny(e: unknown) {
  if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  let caller: Caller;
  let order: Record<string, unknown>;
  try {
    ({ caller, order } = await editor(req, orderId));
  } catch (e) {
    return deny(e);
  }

  const [client, carrier, requestSnap] = await Promise.all([
    currentTerms('client'),
    currentTerms('carrier'),
    // One equality filter, the status in memory — no composite index.
    termsRequests().where('orderId', '==', orderId).get(),
  ]);
  const general = { client: client.text, carrier: carrier.text };
  const pending = requestSnap.docs.map(serializeRequest).filter((r) => r.status === 'pending');

  return NextResponse.json({
    ...Object.fromEntries(PARTIES.map((party) => [party, {
      own: orderTermsOf(order, party),
      general: general[party],
      pending: pending.filter((r) => r.party === party),
    }])),
    canApprove: canApproveTerms(caller),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

/** `{ party, text, reason? }` — `text` null puts the load back on the general terms. */
export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  let caller: Caller;
  let order: Record<string, unknown>;
  try {
    ({ caller, order } = await editor(req, orderId));
  } catch (e) {
    return deny(e);
  }

  const body = await req.json().catch(() => null);
  const party = body?.party as TermsParty;
  if (!PARTIES.includes(party)) return NextResponse.json({ error: 'Say whose terms these are.' }, { status: 400 });

  let text: string | null = null;
  if (body?.text !== null) {
    const checked = validateTerms(body?.text, party);
    if ('error' in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
    text = checked.text;
  }
  const own = orderTermsOf(order, party);
  if (own === text) return NextResponse.json({ error: 'That is what this load already has.' }, { status: 400 });

  if (canApproveTerms(caller)) {
    try {
      await applyOrderTerms(orderId, party, text, actorOf(caller));
    } catch (e) {
      return deny(e);
    }
    return NextResponse.json({ applied: true });
  }

  const request = await fileTermsRequest(caller, {
    scope: 'order',
    party,
    orderId,
    order,
    text,
    baseText: own ?? (await currentTerms(party)).text,
    reason: cleanReason(body?.reason),
  });
  return NextResponse.json({ applied: false, request });
}
