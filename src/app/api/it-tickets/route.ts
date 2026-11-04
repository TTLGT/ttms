import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { createTicket, listTickets } from '@/lib/itTicketsServer';
import {
  MAX_TICKET_DEVICE,
  MAX_TICKET_PAGE,
  MAX_TICKET_TEXT,
  MAX_TICKET_TITLE,
  isItTicketCategory,
  isItTicketPriority,
} from '@/types/itTicket';

// Each attachment is checked in the bucket before the ticket is written.
export const maxDuration = 30;

function fail(e: unknown) {
  if (e instanceof AdminAuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  throw e;
}

/**
 * The IT account's whole desk, or the caller's own tickets — decided from the
 * verified email, never from a parameter. See src/types/itTicket.ts.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    return NextResponse.json({ tickets: await listTickets(caller) });
  } catch (e) {
    return fail(e);
  }
}

/** Raises a ticket. Open to every allowlisted account, interns included. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const title = (typeof body.title === 'string' ? body.title.trim() : '').slice(0, MAX_TICKET_TITLE);
    const text  = (typeof body.text === 'string' ? body.text.trim() : '').slice(0, MAX_TICKET_TEXT);
    if (!title) return NextResponse.json({ error: 'Give the problem a short title' }, { status: 400 });
    if (!text)  return NextResponse.json({ error: 'Say what happened' }, { status: 400 });

    const ticket = await createTicket(caller, {
      title,
      text,
      category: isItTicketCategory(body.category) ? body.category : 'other',
      priority: isItTicketPriority(body.priority) ? body.priority : 'normal',
      page:     (typeof body.page === 'string' ? body.page.trim() : '').slice(0, MAX_TICKET_PAGE),
      device:   (typeof body.device === 'string' ? body.device.trim() : '').slice(0, MAX_TICKET_DEVICE),
      attachments: body.attachments,
    });
    return NextResponse.json({ ticket });
  } catch (e) {
    return fail(e);
  }
}
