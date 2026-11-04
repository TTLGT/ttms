import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { addMessage } from '@/lib/itTicketsServer';
import { MAX_TICKET_TEXT, isItTicketStatus } from '@/types/itTicket';

type RouteContext = { params: Promise<{ ticketId: string }> };

// Each attachment is checked in the bucket before the message is written.
export const maxDuration = 30;

function fail(e: unknown) {
  if (e instanceof AdminAuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  throw e;
}

/**
 * A reply on a ticket, from the reporter or the IT account. `internal` and
 * `status` are honoured only for the IT account — addMessage() ignores them
 * for anybody else rather than trusting the request.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { ticketId } = await params;
  try {
    const caller = await requireCaller(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const text = (typeof body.text === 'string' ? body.text.trim() : '').slice(0, MAX_TICKET_TEXT);
    await addMessage(caller, ticketId, {
      text,
      internal:    body.internal === true,
      attachments: body.attachments,
      status:      isItTicketStatus(body.status) ? body.status : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
