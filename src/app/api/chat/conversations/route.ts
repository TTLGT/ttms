import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminDb, AdminAuthError, requireCompanyUser } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { MAX_ROOM_NAME, validMembers } from '@/lib/chatServer';
import {
  COMPANY_CONVERSATION_ID,
  CONVERSATIONS_COLLECTION,
  directConversationId,
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
 * Opens a direct thread, or creates a named room.
 *
 * A direct thread is addressed by a deterministic id derived from the two
 * uids, so this doubles as "open the thread with this person": if it already
 * exists the existing one is returned untouched. Anything else would give two
 * colleagues who messaged each other simultaneously a thread each.
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
