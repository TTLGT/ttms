import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminDb, AdminAuthError, requireAdmin } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { TEAMS_COLLECTION, USERS_COLLECTION } from '@/lib/accessControl';

/**
 * Teams — the reporting structure. See src/types/team.ts for why these are
 * kept apart from work groups: a team says who you report to, a work group
 * says whose records you can open, and conflating the two would make the org
 * chart grant data access.
 */

/** Every team. Readable by any signed-in user so pickers can render names. */
export async function GET(req: NextRequest) {
  try {
    await requireCaller(req);
    const snap = await adminDb.collection(TEAMS_COLLECTION).orderBy('name').get();
    return NextResponse.json({
      teams: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/**
 * The lead has to be someone who exists, or the team would display a name it
 * cannot resolve. Checked here rather than trusted from the picker, which can
 * be stale by the time it is submitted.
 */
async function validLead(value: unknown): Promise<string | null | 'missing'> {
  if (typeof value !== 'string' || !value) return null;
  const snap = await adminDb.collection(USERS_COLLECTION).doc(value).get();
  return snap.exists ? value : 'missing';
}

/** Creates a team. Names are unique so the picker can never show two alike. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));

    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'A team name is required.' }, { status: 400 });

    const existing = await adminDb.collection(TEAMS_COLLECTION).where('name', '==', name).limit(1).get();
    if (!existing.empty) {
      return NextResponse.json({ error: 'A team with that name already exists.' }, { status: 409 });
    }

    const leadUid = await validLead(body.leadUid);
    if (leadUid === 'missing') {
      return NextResponse.json({ error: 'That person is no longer on the system.' }, { status: 400 });
    }

    const ref = adminDb.collection(TEAMS_COLLECTION).doc();
    await ref.set({
      name,
      leadUid,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: caller.email ?? caller.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: ref.id, name }, { status: 201 });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
