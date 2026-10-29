import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { actorOf } from '@/lib/recordHistory';
import {
  cannotMakeLink,
  createDriverLink,
  currentDriverLink,
  emailDriverLink,
  revokeDriverLink,
  toDriverLinkInfo,
} from '@/lib/driverLinksServer';

type RouteContext = { params: Promise<{ orderId: string }> };

// Sending the email is the slow part.
export const maxDuration = 30;

const noStore = { headers: { 'Cache-Control': 'private, no-store' } };

function fail(e: unknown) {
  if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
}

/**
 * The load's driver link and what the driver has reported — see
 * src/types/driverLink.ts. Same boundary as the client's signing link
 * (GET /sign-link): anybody who can open the load can see, make, send or
 * switch off its driver link. The link gives the driver nothing beyond
 * reporting on this one trip.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    const order  = await getVisibleOrder(caller, orderId);
    const link   = await currentDriverLink(orderId);
    return NextResponse.json({
      link: link ? toDriverLinkInfo(link.id, link.data) : null,
      cannotMake: cannotMakeLink(order),
    }, noStore);
  } catch (e) {
    return fail(e);
  }
}

/**
 * `{ action: 'create' }` makes a new link (switching off the old one);
 * `{ action: 'email', email }` emails the live one, making it first if there
 * is none.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    const order  = await getVisibleOrder(caller, orderId);
    const body   = (await req.json().catch(() => ({}))) as { action?: unknown; email?: unknown };
    const actor  = actorOf(caller);

    const problem = cannotMakeLink(order);
    if (problem) return NextResponse.json({ error: problem }, { status: 409 });

    let link = body.action === 'create' ? null : await currentDriverLink(orderId);
    if (link && toDriverLinkInfo(link.id, link.data).expired) link = null;
    if (!link) link = await createDriverLink(orderId, order, actor);

    if (body.action === 'email') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 200) : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: 'Type the email address to send it to.' }, { status: 400 });
      }
      try {
        await emailDriverLink(link.id, link.data, email, actor);
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'The email could not be sent' }, { status: 502 });
      }
      link = await currentDriverLink(orderId) ?? link;
    }
    return NextResponse.json({ link: toDriverLinkInfo(link.id, link.data) }, noStore);
  } catch (e) {
    return fail(e);
  }
}

/** Switches the link off. The driver sees "this link is no longer active". */
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    await getVisibleOrder(caller, orderId);
    await revokeDriverLink(orderId, actorOf(caller));
    return NextResponse.json({ link: null }, noStore);
  } catch (e) {
    return fail(e);
  }
}
