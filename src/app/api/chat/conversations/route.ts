import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminDb, AdminAuthError, requireCompanyUser } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { readOrder } from '@/lib/orderAccess';
import { openedAlert, postOrderAlert } from '@/lib/chatAlerts';
import { MAX_ROOM_NAME, validMembers } from '@/lib/chatServer';
import { orderDisplayNumber } from '@/types/order';
import {
  COMPANY_CONVERSATION_ID,
  CONVERSATIONS_COLLECTION,
  directConversationId,
  recordConversationId,
} from '@/types/conversation';

/**
 * Creating conversations, and making sure the company room exists.
 *
 * Messages themselves are written straight from the browser under the rules
 * (see src/lib/chat.ts for why). What lands here is only the structural part:
 * bringing a conversation into existence and deciding who is in it. Those
 * decide who can read what, so they are settled server-side where the caller
 * cannot name themselves a member of somebody else's room.
 *
 * Guarded like every other route in this app — there is no middleware backstop.
 */

const COL = CONVERSATIONS_COLLECTION;

/**
 * Creates the company room if it is not there yet, and reports it.
 *
 * The room is made on demand rather than by a migration script: there is no
 * deployment step in this project that could run one, and an empty database
 * would otherwise show every user an error the first time they opened chat.
 * `create` is used rather than `set` so two people opening chat at the same
 * moment cannot overwrite each other — the loser's ALREADY_EXISTS is expected
 * and swallowed.
 */
export async function GET(req: NextRequest) {
  try {
    await requireCompanyUser(req);

    const ref  = adminDb.collection(COL).doc(COMPANY_CONVERSATION_ID);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.create({
        kind:        'company',
        name:        'Everyone',
        // Deliberately empty: everyone allowed into TTMS is in this room, and
        // the rules grant it on `kind` rather than on membership. See the note
        // in src/types/conversation.ts.
        memberUids:  [],
        createdBy:   'system',
        createdAt:   FieldValue.serverTimestamp(),
        updatedAt:   FieldValue.serverTimestamp(),
        lastMessage: null,
      }).catch((e: { code?: number }) => {
        // 6 = ALREADY_EXISTS. Someone else got there first, which is the
        // outcome we wanted anyway.
        if (e?.code !== 6) throw e;
      });
    }

    return NextResponse.json({ companyConversationId: COMPANY_CONVERSATION_ID });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/**
 * Opens a direct thread, opens the room about a record, or creates a named room.
 *
 * A direct thread is addressed by a deterministic id derived from the two
 * uids, so this doubles as "open the thread with this person": if it already
 * exists the existing one is returned untouched. Anything else would give two
 * colleagues who messaged each other simultaneously a thread each. A record
 * room works the same way and for the same reason, with the id derived from
 * the record — plus the access check that decides whether the caller may be in
 * it at all.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    const body   = await req.json().catch(() => ({}));
    const kind   = String(body.kind ?? '');

    if (kind === 'direct') {
      const otherUid = String(body.otherUid ?? '').trim();
      if (!otherUid) {
        return NextResponse.json({ error: 'Who do you want to message?' }, { status: 400 });
      }
      if (otherUid === caller.uid) {
        return NextResponse.json({ error: 'You cannot start a thread with yourself.' }, { status: 400 });
      }
      // The other person must be a real, provisioned user. Without this check
      // a caller could conjure a thread against any string and hold a
      // conversation document naming a uid that never existed.
      const other = await adminDb.collection('users').doc(otherUid).get();
      if (!other.exists) {
        return NextResponse.json({ error: 'That person has not signed in to TTMS yet.' }, { status: 404 });
      }

      const id  = directConversationId(caller.uid, otherUid);
      const ref = adminDb.collection(COL).doc(id);
      const existing = await ref.get();
      if (!existing.exists) {
        await ref.create({
          kind:        'direct',
          name:        '',
          memberUids:  [caller.uid, otherUid].sort(),
          createdBy:   caller.uid,
          createdAt:   FieldValue.serverTimestamp(),
          updatedAt:   FieldValue.serverTimestamp(),
          lastMessage: null,
        }).catch((e: { code?: number }) => {
          if (e?.code !== 6) throw e;
        });
      }
      return NextResponse.json({ id }, { status: 201 });
    }

    if (kind === 'record') {
      const recordType = String(body.recordType ?? '');
      // Orders only for now. Carriers and clients are the obvious next two,
      // and each needs its own access check written here — which is the whole
      // reason this is a closed list rather than a collection name off the
      // request. A caller who could name the collection could open a room
      // about a document nothing in this route knows how to gate.
      if (recordType !== 'order') {
        return NextResponse.json({ error: 'Unknown record type.' }, { status: 400 });
      }

      const recordId = String(body.recordId ?? '').trim();
      if (!recordId) {
        return NextResponse.json({ error: 'Which order?' }, { status: 400 });
      }

      /*
       * The check this whole route exists for.
       *
       * A record room has no invitations: whoever can see the order is in the
       * room about it, and joining is what opening it does. "Can this person
       * see this order" is the union of their own ownership, their groups' and
       * their clients' — the same question /api/orders answers, and one the
       * browser cannot be trusted to answer about itself. So it is answered
       * here, with the Admin SDK, before the caller's uid goes anywhere near
       * the membership array the security rules read.
       */
      const access = await readOrder(caller, recordId);
      if (access.status === 'missing') {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }
      if (access.status === 'denied') {
        // Named, like the order route itself does, so the answer is "this is
        // Maria's load, ask her" rather than a dead end.
        return NextResponse.json(
          { error: 'You do not have access to this order', ownerName: access.ownerName },
          { status: 403 },
        );
      }

      const label = orderDisplayNumber(access.order as { orderNumber?: string; batsId?: string });
      const id    = recordConversationId('order', recordId);
      const ref   = adminDb.collection(COL).doc(id);
      const snap  = await ref.get();

      if (!snap.exists) {
        try {
          await ref.create({
            kind:        'record',
            // Held as the room's name too, so anything reading a conversation
            // without knowing about record rooms still has something to show.
            name:        `Order ${label}`,
            recordType:  'order',
            recordId,
            recordLabel: label,
            memberUids:  [caller.uid],
            createdBy:   caller.uid,
            createdAt:   FieldValue.serverTimestamp(),
            updatedAt:   FieldValue.serverTimestamp(),
            lastMessage: null,
          });

          // Where the load stands, as the room's first line. A record room is
          // the one kind that can be opened by somebody who was not part of
          // whatever prompted it, so it starts by saying what it is about.
          await postOrderAlert(recordId, openedAlert(access.order as {
            status?: string; carrierName?: string; clientName?: string;
          })).catch(() => {});
        } catch (e) {
          // 6 = ALREADY_EXISTS: two people pressed Discuss on the same load in
          // the same second. The loser joins the room the winner just made,
          // which is exactly what a derived id is for.
          if ((e as { code?: number }).code !== 6) throw e;
          await ref.update({ memberUids: FieldValue.arrayUnion(caller.uid) });
        }
      } else if (!((snap.data()!.memberUids ?? []) as string[]).includes(caller.uid)) {
        // Joining. `updatedAt` is left alone: arriving in a room is not
        // speaking in it, and bumping it would shove the room to the top of
        // the list of everybody already in it.
        await ref.update({ memberUids: FieldValue.arrayUnion(caller.uid) });
      }

      return NextResponse.json({ id }, { status: 201 });
    }

    if (kind === 'group') {
      const name = String(body.name ?? '').trim().slice(0, MAX_ROOM_NAME);
      if (!name) {
        return NextResponse.json({ error: 'Give the room a name.' }, { status: 400 });
      }

      // The creator is always in the room. Leaving them out would produce a
      // room they can see in neither view and cannot get back into.
      const memberUids = await validMembers(body.memberUids, caller.uid);
      if (memberUids.length < 2) {
        return NextResponse.json({ error: 'Add at least one other person.' }, { status: 400 });
      }

      const ref = adminDb.collection(COL).doc();
      await ref.set({
        kind:        'group',
        name,
        memberUids,
        createdBy:   caller.uid,
        createdAt:   FieldValue.serverTimestamp(),
        updatedAt:   FieldValue.serverTimestamp(),
        lastMessage: null,
      });
      return NextResponse.json({ id: ref.id }, { status: 201 });
    }

    return NextResponse.json({ error: 'Unknown conversation type.' }, { status: 400 });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
