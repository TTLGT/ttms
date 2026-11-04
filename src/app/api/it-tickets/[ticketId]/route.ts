import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getTicketThread, updateTicket } from '@/lib/itTicketsServer';

type RouteContext = { params: Promise<{ ticketId: string }> };

function fail(e: unknown) {
  if (e instanceof AdminAuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  throw e;
}

/**
 * One ticket and its conversation, with signed links for every file. The IT
 * account gets internal notes; the reporter does not, and anybody else gets a
 * 404. Decided in getTicketThread() from the verified caller.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { ticketId } = await params;
  try {
    const caller = await requireCaller(req);
    return NextResponse.json(await getTicketThread(caller, ticketId));
  } catch (e) {
    return fail(e);
  }
}

/**
 * Status, priority and category for the IT account; for the reporter, closing
 * their own ticket and nothing else. updateTicket() enforces which.
 */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { ticketId } = await params;
  try {
    const caller = await requireCaller(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({ ticket: await updateTicket(caller, ticketId, body) });
  } catch (e) {
    return fail(e);
  }
}
