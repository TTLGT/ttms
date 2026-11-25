import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { SalesActivityRefused, actOnClient, clientSalesView } from '@/lib/clientSalesServer';

/**
 * A client's sales side — its lead stage, next step, and every call, email
 * and note logged on it. See src/types/clientSales.ts.
 *
 * Guarded twice, both in lib/clientSalesServer.ts: the caller must be able to
 * open the client at all (readParty), and then be the broker working it,
 * their Sales Manager, or `sales.viewAll`. Somebody who passes the first and
 * not the second gets `{ visible: false }` and nothing else.
 *
 *   GET                                   — the view
 *   POST { action: 'log', kind, text }    — a call, an email or a note
 *   POST { action: 'lead' }               — start working it as a lead
 *   POST { action: 'stage', stage }       — Found, Contacted or Quoted
 *   POST { action: 'next', nextStep, nextDue }
 *   POST { action: 'lost', reason } / { action: 'reopen' }
 */
function fail(e: unknown) {
  if (e instanceof SalesActivityRefused) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ partyId: string }> }) {
  try {
    const caller = await requireCaller(req);
    const { partyId } = await params;
    return NextResponse.json(await clientSalesView(caller, partyId));
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ partyId: string }> }) {
  try {
    const caller = await requireCaller(req);
    const { partyId } = await params;
    const body = await req.json().catch(() => null);
    return NextResponse.json(await actOnClient(caller, partyId, body));
  } catch (e) {
    return fail(e);
  }
}
