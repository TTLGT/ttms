import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { can } from '@/lib/accessControl';
import {
  MAX_ROOM_NAME,
  readMuteUntil,
  readPolicyPatch,
  roomPhotoBelongsTo,
  validMembers,
  writeRoomChange,
  type RoomChange,
} from '@/lib/chatServer';
import {
  CONVERSATIONS_COLLECTION,
  isRoomAdmin,
  roomAdminUids,
  roomAllows,
  type Conversation,
} from '@/types/conversation';

const COL = CONVERSATIONS_COLLECTION;

/**
 * Everything about a room that is not somebody speaking in it: its name, its
 * picture, who is in it, who runs it, what it lets the rest of them do, and
 * who has been stopped from writing.
 *
 * All of it is here rather than in the browser because all of it decides
 * access. `firestore.rules` refuses every one of these fields to the client
 * outright, which is what makes this the only way in — a browser that could
 * write `adminUids` could make itself an admin, and a browser that could write
 * `memberUids` could let itself into somebody else's room.
 *
 * **The half of the policy that is not enforced here is enforced in the
 * rules**, and the split is worth holding on to: who may post, attach, link
 * and pin has to be checked at the write, because messages go to Firestore
 * straight from the browser. Who may rename the room and who may change its
 * membership are checked here, because those two already come through this
 * route. See RoomPolicy in src/types/conversation.ts.
 */

/** The room, in the shape the type helpers in types/conversation.ts want. */
type RoomShape = Pick<
  Conversation, 'kind' | 'createdBy' | 'adminUids' | 'memberUids' | 'policy' | 'mutedUntil'
>;

function roomShapeOf(data: FirebaseFirestore.DocumentData): RoomShape {
  return {
    kind:       data.kind,
    createdBy:  data.createdBy ?? '',
    adminUids:  Array.isArray(data.adminUids) ? data.adminUids as string[] : undefined,
    memberUids: (data.memberUids ?? []) as string[],
    policy:     (data.policy ?? {}) as Conversation['policy'],
    mutedUntil: (data.mutedUntil ?? {}) as Record<string, number>,
  };
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

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

    const data = snap.data()!;
    const room = roomShapeOf(data);
    const body = await req.json().catch(() => ({}));

    // Whether the caller may address the whole company. It decides the
    // company room outright and nothing else — see `chat.announce`.
    const announcer = can(caller.profile, 'chat.announce');

    /*
     * The company room, which is a room in only some of the ways the rest of
     * this route means.
     *
     * It has no membership to change, no name worth changing and no picture,
     * so exactly one switch reaches it: whether it is open to everyone or has
     * been turned down to announcements. Nothing else from the body is read,
     * which is what stops this branch from becoming a way to write fields onto
     * the one conversation every employee can read.
     */
    if (room.kind === 'company') {
      if (!announcer) {
        return forbidden('Only an admin or HR can change who may post in the Everyone room.');
      }
      const moved = readPolicyPatch(body.policy, room.policy)
        .filter((p) => p.key === 'post');
      if (moved.length === 0) {
        return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
      }

      const batch = adminDb.batch();
      const announced = await writeRoomChange(
        batch, ref, { policy: moved }, { uid: caller.uid, name: caller.displayName },
      );
      batch.update(ref, { 'policy.post': moved[0].value, ...announced });
      await batch.commit();
      return NextResponse.json({ id: conversationId });
    }

    /*
     * Everything else is a named room.
     *
     * A direct thread is defined by its two people, and changing either would
     * silently turn one conversation into a different one while keeping its
     * history. A record room is titled by its load and joined by whoever can
     * open it, so there is nothing here for it either.
     */
    if (room.kind !== 'group') {
      return NextResponse.json(
        { error: 'Only a room can be renamed or have its members changed.' },
        { status: 400 },
      );
    }
    // Not found rather than forbidden: a stranger should not learn that a room
    // with this id exists at all.
    if (!room.memberUids.includes(caller.uid)) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const wasAdmins = roomAdminUids(room);
    const iAmAdmin  = isRoomAdmin(room, caller.uid);

    const patch:  Record<string, unknown> = {};
    const change: RoomChange = {};

    /* ------------------------------------------------- the name and picture */

    if (typeof body.name === 'string' || body.photoPath !== undefined) {
      if (!roomAllows(room, 'details', caller.uid)) {
        return forbidden('Only this room’s admins can change its name or picture.');
      }
    }

    if (typeof body.name === 'string') {
      const name = body.name.trim().slice(0, MAX_ROOM_NAME);
      if (!name) return NextResponse.json({ error: 'Give the room a name.' }, { status: 400 });
      patch.name = name;
    }

    // The room's picture. A path in the room's own storage folder, or null to
    // go back to the `#`. It is checked rather than trusted because every
    // staff account can read the whole bucket prefix — see roomPhotoBelongsTo.
    if (body.photoPath === null) {
      patch.photoPath = null;
    } else if (typeof body.photoPath === 'string') {
      if (!roomPhotoBelongsTo(body.photoPath, conversationId)) {
        return NextResponse.json(
          { error: 'That picture does not belong to this room.' },
          { status: 400 },
        );
      }
      patch.photoPath = body.photoPath;
    }

    /* ------------------------------------------------------- who is in it */

    // Who came and who went, worked out before the write so the history can
    // say it. An empty pair means the save touched something else, and nothing
    // is recorded — a room is not a different room because somebody renamed it.
    let nextMembers = room.memberUids;

    if (Array.isArray(body.memberUids)) {
      if (!roomAllows(room, 'membership', caller.uid)) {
        return forbidden('Only this room’s admins can change who is in it.');
      }
      // The caller is added back by validMembers, so nobody can edit
      // themselves out of a room here and leave it unreachable. Leaving is a
      // separate, deliberate action — see DELETE below.
      nextMembers = await validMembers(body.memberUids, caller.uid);
      if (nextMembers.length < 2) {
        return NextResponse.json({ error: 'A room needs at least two people.' }, { status: 400 });
      }
      patch.memberUids  = nextMembers;
      change.added   = nextMembers.filter((uid) => !room.memberUids.includes(uid));
      change.removed = room.memberUids.filter((uid) => !nextMembers.includes(uid));
    }

    /* ---------------------------------------------------------- who runs it */

    if (Array.isArray(body.adminUids) && !iAmAdmin) {
      return forbidden('Only this room’s admins can decide who else runs it.');
    }

    /*
     * The admin list, always recomputed and always written inside the room.
     *
     * Two invariants are kept here rather than hoped for, because the rules
     * depend on both. `adminUids` never names somebody who is not in the room,
     * which is what lets an empty list mean "nobody left who runs this" in
     * roomAdminUids() and in `isRoomBoss()` in the rules. And it is never
     * empty while the room has members, which is what stops a room being
     * locked into a policy nobody can unlock.
     *
     * A room from before admins existed is normalised on its first save: the
     * `createdBy` fallback is resolved into a real list, so the fallback stops
     * being load-bearing the moment anybody touches the room.
     */
    const requested = Array.isArray(body.adminUids)
      ? await validMembers(body.adminUids, caller.uid)
      : wasAdmins;

    let nextAdmins = Array.from(new Set(requested)).filter((uid) => nextMembers.includes(uid));
    if (nextAdmins.length === 0) {
      // Reachable two ways: a legacy room whose creator has since left it, in
      // which case everybody in it is an admin and the person saving is as
      // good a choice as any; and an admin trying to save a room with no
      // admins at all, which is the state this exists to make unreachable.
      if (Array.isArray(body.adminUids)) {
        return NextResponse.json(
          { error: 'A room needs at least one admin. Make somebody else an admin first.' },
          { status: 400 },
        );
      }
      nextAdmins = [caller.uid];
    }

    if (JSON.stringify(nextAdmins) !== JSON.stringify(room.adminUids ?? null)) {
      patch.adminUids     = nextAdmins;
      change.adminAdded   = nextAdmins.filter((uid) => !wasAdmins.includes(uid));
      // Somebody taken out of the room entirely is not also reported as having
      // lost their admin: they lost the room, which the history already says.
      change.adminRemoved = wasAdmins.filter(
        (uid) => !nextAdmins.includes(uid) && nextMembers.includes(uid),
      );
    }

    /* ------------------------------------------------------ what it allows */

    if (body.policy !== undefined) {
      if (!iAmAdmin) {
        return forbidden('Only this room’s admins can change what the room allows.');
      }
      const moved = readPolicyPatch(body.policy, room.policy);
      for (const p of moved) patch[`policy.${p.key}`] = p.value;
      if (moved.length > 0) change.policy = moved;
    }

    /* ------------------------------------------------------------- muting */

    if (body.mute !== undefined || body.unmute !== undefined) {
      if (!iAmAdmin) {
        return forbidden('Only this room’s admins can mute somebody.');
      }
    }

    if (body.mute) {
      const uid = String(body.mute.uid ?? '');
      if (!nextMembers.includes(uid)) {
        return NextResponse.json({ error: 'That person is not in this room.' }, { status: 400 });
      }
      // Muting yourself is not a thing an admin means to do, and it would be
      // undone by the same person a moment later.
      if (uid === caller.uid) {
        return NextResponse.json({ error: 'You cannot mute yourself.' }, { status: 400 });
      }
      // An admin is not mutable, because a mute they can lift themselves is
      // theatre. The honest version of the request is the one this names.
      if (nextAdmins.includes(uid)) {
        return NextResponse.json(
          { error: 'That person is an admin here. Take their admin away first.' },
          { status: 400 },
        );
      }
      // Throws with a sentence rather than defaulting — see readMuteUntil. A
      // mute with no deadline is the thing the deadline exists to prevent.
      let until: number;
      try {
        until = readMuteUntil(body.mute.until);
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : 'Say when the mute should lift.' },
          { status: 400 },
        );
      }
      patch[`mutedUntil.${uid}`] = until;
      change.muted = [{ uid, until }];
    }

    if (typeof body.unmute === 'string' && body.unmute) {
      // Set to zero rather than deleted. The key is what the rules compare
      // against the clock, and a lapsed mute is left in place anyway — see the
      // note on `mutedUntil`. Removing it would lose the fact that it happened
      // for no saving worth having.
      patch[`mutedUntil.${body.unmute}`] = 0;
      change.unmuted = [String(body.unmute)];
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
    }

    /*
     * The change, its history entries and the line announcing it, in one
     * batch. A change that saved without its entry is the silent one this
     * trail exists to rule out.
     *
     * `updatedAt` is left alone by the patch itself: that field orders the
     * conversation list by when someone last spoke, and renaming a room is not
     * somebody speaking in it. A membership or policy change does bump it, but
     * through the line it posts rather than from here — see systemLine, and
     * the note there about an announcement nobody is shown.
     */
    const batch = adminDb.batch();
    Object.assign(patch, await writeRoomChange(
      batch, ref, change, { uid: caller.uid, name: caller.displayName },
    ));
    batch.update(ref, patch);
    await batch.commit();
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
 *
 * **The last admin cannot walk out of a room that still has people in it**
 * without naming who takes over. A room whose only admin has gone is a room
 * frozen in whatever state it was last locked into, with nobody able to change
 * the membership, unlock the composer or lift a mute — and the person best
 * placed to say who should run it next is the one currently running it. So the
 * first call is refused with the candidates, and the second carries a
 * successor. That is the whole handover: one hop, and the room is never
 * without somebody responsible for it.
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

    const data = snap.data()!;
    const room = roomShapeOf(data);

    // A record room can be left as well as a named one: it is the one kind of
    // room nobody was invited to, so somebody who opened the conversation
    // about a load once must be able to put it down. Pressing Discuss on that
    // order puts them straight back, which is why this needs no confirmation
    // that a named room's does.
    if (!['group', 'record'].includes(room.kind)) {
      return NextResponse.json(
        { error: 'You can only leave a room. The company room and direct messages stay.' },
        { status: 400 },
      );
    }

    const body   = await req.json().catch(() => ({}));
    const admins = roomAdminUids(room);
    const others = room.memberUids.filter((uid) => uid !== caller.uid);

    const change: RoomChange = { left: true };
    const patch:  Record<string, unknown> = {
      memberUids: FieldValue.arrayRemove(caller.uid),
    };

    // The handover. Only when the caller is the last admin and somebody would
    // be left behind — a room emptying out entirely has nobody to hand it to,
    // and roomAdminUids() opens an admin-less room to whoever is in it.
    if (room.kind === 'group' && admins.length === 1 && admins[0] === caller.uid && others.length > 0) {
      const successorUid = String(body?.successorUid ?? '');
      if (!others.includes(successorUid)) {
        // 409 rather than 400: nothing about the request is malformed, the
        // room is simply in a state that needs one more decision. The
        // candidates ride along so the dialog can ask without a second call.
        return NextResponse.json(
          {
            error: 'You are the only admin here. Choose who takes over before you leave.',
            needsSuccessor: true,
            candidates: others,
          },
          { status: 409 },
        );
      }
      patch.adminUids   = [successorUid];
      change.adminAdded = [successorUid];
    } else if (room.kind === 'group' && admins.includes(caller.uid)) {
      // An admin leaving a room that has others: their name comes off the list
      // in the same write, or `adminUids` is left naming somebody who is not
      // in the room and the invariant the rules lean on is broken.
      patch.adminUids = admins.filter((uid) => uid !== caller.uid);
    }

    const batch = adminDb.batch();
    // Named rooms only. A record room is joined by whoever opens the load, so
    // a room about a busy order would fill with entries recording who had
    // looked at it — and there is no history panel on one to read them back.
    // See MEMBER_EVENTS_COLLECTION.
    const announced = room.kind === 'group'
      ? await writeRoomChange(batch, ref, change, { uid: caller.uid, name: caller.displayName })
      : {};
    // One write to the room, carrying all of it: a commit may not touch the
    // same document twice.
    batch.update(ref, { ...patch, ...announced });
    await batch.commit();
    return NextResponse.json({ left: conversationId });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
