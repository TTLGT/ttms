import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { MAX_ROOM_NAME, validMembers } from '@/lib/chatServer';
import { CONVERSATIONS_COLLECTION } from '@/types/conversation';

const COL = CONVERSATIONS_COLLECTION;

/**
 * Renaming a room and changing who is in it.
 *
 * Only for `group` rooms. The company room belongs to everyone and has no
 * membership to edit; a direct thread is defined by its two people, and
 * changing either would silently turn one conversation into a different one
 * while keeping its history.
 *
 * Any member may edit, not only the creator. These are working rooms, not
 * owned records — the person who happened to open it is often not the one
 * still running it a month later, and there is no admin here to appeal to.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  try {
    const { conversationId } = await params;
    const caller = await requireCaller(req);

    const ref  = adminDb.collection(COL).doc(conversationId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const data       = snap.data()!;
    const memberUids = (data.memberUids ?? []) as string[];

    if (data.kind !== 'group') {
      return NextResponse.json(
        { error: 'Only a room can be renamed or have its members changed.' },
        { status: 400 },
      );
    }
    // Not found rather than forbidden: a stranger should not learn that a room
    // with this id exists at all.
    if (!memberUids.includes(caller.uid)) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const body  = await req.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};

    if (typeof body.name === 'string') {
      const name = body.name.trim().slice(0, MAX_ROOM_NAME);
      if (!name) return NextResponse.json({ error: 'Give the room a name.' }, { status: 400 });
      patch.name = name;
    }

    if (Array.isArray(body.memberUids)) {
      // The caller is added back by validMembers, so nobody can edit
      // themselves out of a room here and leave it unreachable. Leaving is a
      // separate, deliberate action — see DELETE below.
      const next = await validMembers(body.memberUids, caller.uid);
      if (next.length < 2) {
        return NextResponse.json({ error: 'A room needs at least two people.' }, { status: 400 });
      }
      patch.memberUids = next;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
    }

    // Not `updatedAt`: that field orders the conversation list by when someone
    // last spoke, and renaming a room is not somebody speaking in it. Bumping
    // it here would shove a quiet room to the top of everyone's list.
    await ref.update(patch);
    return NextResponse.json({ id: conversationId });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/**
 * Leaves a room.
 *
 * The conversation and its messages stay put for everyone still in it — this
 * removes the caller and nothing else. Deleting a shared history because one
 * person walked out of it is not a thing a chat should do.
 *
 * A room emptied down to its last member is left alone rather than cleaned up:
 * an empty room costs one document, and a sweep that deletes message history
 * on a membership change is a far worse failure mode than a bit of clutter.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  try {
    const { conversationId } = await params;
    const caller = await requireCaller(req);

    const ref  = adminDb.collection(COL).doc(conversationId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    // A record room can be left as well as a named one: it is the one kind of
    // room nobody was invited to, so somebody who opened the conversation
    // about a load once must be able to put it down. Pressing Discuss on that
    // order puts them straight back, which is why this needs no confirmation
    // that a named room's does.
    if (!['group', 'record'].includes(snap.data()!.kind)) {
      return NextResponse.json(
        { error: 'You can only leave a room. The company room and direct messages stay.' },
        { status: 400 },
      );
    }

    await ref.update({ memberUids: FieldValue.arrayRemove(caller.uid) });
    return NextResponse.json({ left: conversationId });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
