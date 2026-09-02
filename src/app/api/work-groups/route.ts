import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminDb, AdminAuthError, requirePermission } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';

const COL = 'workGroups';

/** Every group. Readable by any signed-in user so pickers can render names. */
export async function GET(req: NextRequest) {
  try {
    await requireCaller(req);
    const snap = await adminDb.collection(COL).orderBy('name').get();
    return NextResponse.json({
      groups: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/**
 * Creates a group and mirrors membership onto each member's profile.
 *
 * The mirror is what security rules test — rules cannot run a query, so a party
 * owned by a group is checked with `assignedToGroupIds.hasAny(profile.groupIds)`
 * rather than by looking up the group. Both sides are written in one
 * transaction so they can never drift apart.
 */
export async function POST(req: NextRequest) {
  try {
    await requirePermission(req, 'settings.manage');
    const body = await req.json().catch(() => ({}));

    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'A group name is required.' }, { status: 400 });

    const memberUids: string[] = Array.isArray(body.memberUids)
      ? uniqueUids(body.memberUids)
      : [];
    // Members who exist but have never signed in. They have no uid yet, so the
    // group holds their email until /api/auth/session converts it on their
    // first sign-in. Without this a group could not be built out ahead of a
    // new hire's start date.
    const memberEmails: string[] = Array.isArray(body.memberEmails)
      ? Array.from(new Set((body.memberEmails as unknown[])
          .map((e) => String(e).trim().toLowerCase()).filter(Boolean)))
      : [];

    const existing = await adminDb.collection(COL).where('name', '==', name).limit(1).get();
    if (!existing.empty) {
      return NextResponse.json({ error: 'A group with that name already exists.' }, { status: 409 });
    }

    const ref = adminDb.collection(COL).doc();
    await adminDb.runTransaction(async (tx) => {
      tx.set(ref, {
        name,
        memberUids,
        memberEmails,
        notes:     String(body.notes ?? '').trim(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      for (const uid of memberUids) {
        tx.set(
          adminDb.collection('users').doc(uid),
          { groupIds: FieldValue.arrayUnion(ref.id) },
          { merge: true },
        );
      }
    });

    return NextResponse.json({ id: ref.id, name, memberUids, memberEmails }, { status: 201 });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/** Normalizes a JSON array of member ids into a deduplicated string list. */
function uniqueUids(raw: unknown): string[] {
  const list = Array.isArray(raw) ? (raw as unknown[]) : [];
  return Array.from(new Set(list.map((u) => String(u)).filter(Boolean)));
}
