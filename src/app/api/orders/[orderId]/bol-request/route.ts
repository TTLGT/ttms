import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { can } from '@/lib/accessControl';
import { requireCaller, type Caller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { actorOf, recordEvent } from '@/lib/recordHistory';
import { postOrderAlert } from '@/lib/chatAlerts';
import { bolRecipientsFor, bolRequestRef, emailBol, generateBol, toBolRequest } from '@/lib/bolRequests';
import { MAX_BOL_RECIPIENTS, isBolRecipientKey } from '@/types/bolRequest';

type RouteContext = { params: Promise<{ orderId: string }> };

// Draws the BOL if it is missing, then reads it back out of the bucket and
// sends it. Headroom for a cold start.
export const maxDuration = 60;

/** Admin and dispatch: the people who send the agreements send the BOL. */
const isSender = (caller: Caller) => can(caller.profile, 'orders.sendAgreement');

function fail(e: unknown) {
  if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
}

/**
 * The request on this load, and — for a sender — who it can go to. Anybody
 * who can see the load may read where it stands; the addresses are only
 * worked out for somebody who can send, since nobody else needs them.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    const order = await getVisibleOrder(caller, orderId);
    const sender = isSender(caller);
    const [snap, recipients] = await Promise.all([
      bolRequestRef(orderId).get(),
      sender ? bolRecipientsFor(order) : Promise.resolve([]),
    ]);
    return NextResponse.json({
      request: snap.exists ? toBolRequest(snap.data()!) : null,
      isSender: sender,
      recipients,
    });
  } catch (e) {
    return fail(e);
  }
}

/**
 * `{ action: 'send', recipients: ['carrier', 'shipper:0', …] }` — emails the
 * BOL to the people chosen. Keys only: each is turned into an address by
 * `bolRecipientsFor()` here, so a BOL can never be sent to anybody who is not
 * on the load. Can be sent more than once (a dock that lost it).
 *
 * `{ action: 'done' }` — closes the request, naming who.
 *
 * Sending works with or without an open request, so a sender can also send
 * the BOL of a load whose request is already done.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    if (!isSender(caller)) {
      return NextResponse.json({ error: 'Admin and dispatch send the BOL.' }, { status: 403 });
    }
    const order = await getVisibleOrder(caller, orderId);
    const body = (await req.json().catch(() => ({}))) as { action?: unknown; recipients?: unknown };
    const ref = bolRequestRef(orderId);
    const now = Timestamp.now();

    if (body.action === 'done') {
      const snap = await ref.get();
      if (!snap.exists) return NextResponse.json({ error: 'There is no BOL request on this load.' }, { status: 404 });
      if (snap.data()!.status === 'done') return NextResponse.json({ request: toBolRequest(snap.data()!) });
      await ref.update({ status: 'done', doneAt: now, doneByName: caller.displayName });
      await recordEvent(adminDb.collection('orders').doc(orderId), 'Marked the BOL request done', actorOf(caller)).catch(() => {});
      return NextResponse.json({ request: toBolRequest((await ref.get()).data()!) });
    }

    if (body.action !== 'send') {
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }
    const keys = Array.isArray(body.recipients) ? [...new Set(body.recipients.filter(isBolRecipientKey))] : [];
    if (keys.length === 0) return NextResponse.json({ error: 'Choose who to send the BOL to.' }, { status: 400 });
    if (keys.length > MAX_BOL_RECIPIENTS) return NextResponse.json({ error: 'Too many recipients.' }, { status: 400 });

    const onFile = await bolRecipientsFor(order);
    const chosen = keys.map((k) => onFile.find((r) => r.key === k));
    if (chosen.some((r) => !r)) {
      return NextResponse.json({ error: 'Somebody you chose is no longer on this load. Reload the page.' }, { status: 409 });
    }
    const noEmail = chosen.filter((r) => !r!.email);
    if (noEmail.length) {
      return NextResponse.json({
        error: `No email address on file for: ${noEmail.map((r) => `${r!.label} (${r!.name || 'unnamed'})`).join(', ')}.`,
      }, { status: 400 });
    }
    const to = chosen.map((r) => ({ label: r!.label, email: r!.email }));

    // A load whose BOL nobody has generated yet (a request opened but the
    // generation failed, or an older load): draw it first.
    if (!order.bolStoragePath) await generateBol(orderId, order, actorOf(caller));

    try {
      await emailBol({ orderId, order, to, senderName: caller.displayName, senderEmail: caller.email });
    } catch (e) {
      return NextResponse.json({ error: `The email could not be sent: ${e instanceof Error ? e.message : 'unknown error'}` }, { status: 502 });
    }

    const send = { at: now, byName: caller.displayName, to };
    const snap = await ref.get();
    if (snap.exists) {
      const d = snap.data()!;
      await ref.update({
        sends: [...(Array.isArray(d.sends) ? d.sends : []), send],
        // A send on a closed request stays closed; it was a resend.
        ...(d.status === 'done' ? {} : { status: 'sent' }),
      });
    }
    await postOrderAlert(orderId,
      `${caller.displayName} emailed the BOL to ${to.map((t) => `the ${t.label.toLowerCase()} (${t.email})`).join(', ')}.`,
    ).catch(() => {});

    return NextResponse.json({ request: snap.exists ? toBolRequest((await ref.get()).data()!) : null, sentTo: to });
  } catch (e) {
    return fail(e);
  }
}
