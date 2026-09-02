import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminDb, AdminAuthError, requirePermission } from '@/lib/firebase-admin';
import {
  ALLOWED_USERS_COLLECTION,
  TEAMS_COLLECTION,
  USERS_COLLECTION,
} from '@/lib/accessControl';
import { resolveLead } from '@/lib/teamLead';
import { syncManagedScopes } from '@/lib/teamScope';

/** Renames a team or changes who it reports to. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    await requirePermission(req, 'settings.manage');
    const body = await req.json().catch(() => ({}));

    const ref  = adminDb.collection(TEAMS_COLLECTION).doc(teamId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Team not found' }, { status: 404 });

    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

    if (typeof body.name === 'string') {
      const name = body.name.trim();
      if (!name) return NextResponse.json({ error: 'A team name is required.' }, { status: 400 });

      // Uniqueness is what makes the picker unambiguous, so it has to hold on
      // rename too — not just at creation.
      const clash = await adminDb.collection(TEAMS_COLLECTION).where('name', '==', name).limit(1).get();
      if (!clash.empty && clash.docs[0].id !== teamId) {
        return NextResponse.json({ error: 'A team with that name already exists.' }, { status: 409 });
      }
      patch.name = name;
    }

    // `null` clears the lead, which is a real thing to want between one lead
    // leaving and the next being named — so it is distinguished from the key
    // being absent, which means "leave the lead alone". Either way both fields
    // are written together: leaving a stale `leadEmail` behind after naming a
    // signed-in lead would give the team two answers to "who runs this".
    if ('lead' in body) {
      const lead = await resolveLead(body.lead);
      if (lead === 'missing') {
        return NextResponse.json({ error: 'That person is no longer on the system.' }, { status: 400 });
      }
      Object.assign(patch, lead);
    }

    await ref.update(patch);

    // The lead may have changed hands, which moves a whole team in or out of
    // somebody's scope.
    await syncManagedScopes().catch((e) => {
      console.error('[teams] refreshing managed scopes failed', teamId, e);
    });

    return NextResponse.json({ id: teamId });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/**
 * Deletes a team, first detaching everyone on it.
 *
 * Both copies of the assignment have to go: the allowlist entry is what the
 * Settings list reads, and the profile is what the rest of the app reads.
 * Leaving either behind would point at a team that no longer exists.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    await requirePermission(req, 'settings.manage');

    const ref  = adminDb.collection(TEAMS_COLLECTION).doc(teamId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Team not found' }, { status: 404 });

    const [entries, profiles] = await Promise.all([
      adminDb.collection(ALLOWED_USERS_COLLECTION).where('teamId', '==', teamId).get(),
      adminDb.collection(USERS_COLLECTION).where('teamId', '==', teamId).get(),
    ]);

    const batch = adminDb.batch();
    for (const doc of entries.docs) batch.update(doc.ref, { teamId: null });
    for (const doc of profiles.docs) batch.update(doc.ref, { teamId: null });
    batch.delete(ref);
    await batch.commit();

    // Everyone just lost their team, so any manager who led this one now leads
    // nobody. Their mirror has to be emptied or they keep seeing the records.
    await syncManagedScopes().catch((e) => {
      console.error('[teams] refreshing managed scopes failed', teamId, e);
    });

    return NextResponse.json({ deleted: teamId, detachedUsers: entries.size });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
