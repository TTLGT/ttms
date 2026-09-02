import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, adminDb, requirePermission } from '@/lib/firebase-admin';
import { changeOwners, callerIp, syncClientOwners } from '@/lib/ownership';
import { requireCaller, getVisibleParty } from '@/lib/partyAccess';
import { USERS_COLLECTION } from '@/lib/accessControl';
import { OWNER_EVENTS_SUBCOLLECTION } from '@/types/ownerEvent';

type RouteContext = { params: Promise<{ partyId: string }> };

/**
 * Who may reassign a client.
 *
 * Gated on `ownership.change`, matching orders — admins and dispatchers hold
 * it by role. This route exists because ownership used to be writable straight
 * from the browser through updateParty:
 * since an unowned party is visible to everyone, any broker could claim any
 * unclaimed client and lock the rest of the company out of it, leaving nothing
 * behind to say who did it. Ownership fields are now closed in the rules and
 * this is the only way through.
 */
async function actorFor(req: NextRequest) {
  const { uid } = await requirePermission(req, 'ownership.change');
  const profile = await adminDb.collection(USERS_COLLECTION).doc(uid).get();
  const d = profile.data();
  return { uid, name: d?.displayName || d?.email || uid, ip: callerIp(req) };
}

function ownersFrom(body: Record<string, unknown>) {
  const list = (v: unknown) =>
    Array.isArray(v) ? [...new Set(v.map((x) => String(x)).filter(Boolean))] : [];
  return {
    uids:     list(body.uids),
    groupIds: list(body.groupIds),
    emails:   list(body.emails).map((e) => e.toLowerCase()),
  };
}

/** The ownership history, newest first. Visible to anyone who can see the party. */
export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { partyId } = await params;
    const caller = await requireCaller(req);
    await getVisibleParty(caller, partyId);

    const snap = await adminDb
      .collection('parties').doc(partyId)
      .collection(OWNER_EVENTS_SUBCOLLECTION)
      .orderBy('at', 'desc')
      .get();

    return NextResponse.json({ events: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  return mutate(req, params, 'added');
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  return mutate(req, params, 'removed');
}

async function mutate(
  req: NextRequest,
  params: RouteContext['params'],
  action: 'added' | 'removed',
) {
  try {
    const { partyId } = await params;
    const actor  = await actorFor(req);
    const owners = ownersFrom(await req.json().catch(() => ({})));

    if (owners.uids.length + owners.groupIds.length + owners.emails.length === 0) {
      return NextResponse.json({ error: 'No owners were named.' }, { status: 400 });
    }

    const next = await changeOwners('parties', partyId, action, owners, actor);

    // Owning a client carries access to all of its orders, and the rules read
    // that from a mirror on each order rather than by querying. Refreshing it
    // is part of the change, not a follow-up job: skipping it would leave the
    // new owner unable to see the very orders they just took on.
    const ordersTouched = await syncClientOwners(partyId);

    return NextResponse.json({ owners: next, ordersTouched });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof Error && e.message === 'Record not found') {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    throw e;
  }
}
