import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, FieldValue, adminDb, requireCompanyUser, requirePermission } from '@/lib/firebase-admin';
import { logSettingsChange } from '@/lib/settingsChangeServer';
import {
  PLANNER_STAGE_LABEL, isPlannerStage, readPlannerRollout,
  type PlannerAccess, type PlannerRollout,
} from '@/types/planner';

const DOC = adminDb.collection('appSettings').doc('general');

/**
 * Who has the new Planner — see src/types/planner.ts.
 *
 * Its own route rather than a key on /api/app-settings because of what the
 * GET may say. That route answers every signed-in person with the whole
 * document; this setting holds a list of names, and who is in a pilot is the
 * admin's business, not the office's. So:
 *
 *  - `GET` answers anybody with the stage and whether **they themselves** are
 *    named — the email is the verified one off the ID token, never a parameter.
 *  - `GET ?full=1` answers `settings.manage` with the whole list, for the
 *    Settings page.
 *  - `PUT` is `settings.manage`, and logs to the settings change log in the
 *    same batch, like every company setting.
 *
 * Nothing here is access: the Planner reads the caller's own list through the
 * same routes My tasks does. This decides which pages are drawn.
 */
export async function GET(req: NextRequest) {
  try {
    const full = req.nextUrl.searchParams.get('full') === '1';
    const caller = full
      ? await requirePermission(req, ['settings.manage'])
      : await requireCompanyUser(req);
    const rollout = readPlannerRollout((await DOC.get()).data()?.plannerRollout);
    if (full) return NextResponse.json({ rollout });
    const email = (caller.email ?? '').toLowerCase();
    const access: PlannerAccess = { stage: rollout.stage, chosen: !!email && rollout.chosenEmails.includes(email) };
    return NextResponse.json({ access });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

export async function PUT(req: NextRequest) {
  try {
    const caller = await requirePermission(req, ['settings.manage']);
    const body = await req.json().catch(() => ({}));
    if (!isPlannerStage(body?.stage)) {
      return NextResponse.json({ error: 'Pick who has the Planner.' }, { status: 400 });
    }
    const next: PlannerRollout = readPlannerRollout(body);

    const before = readPlannerRollout((await DOC.get()).data()?.plannerRollout);
    const batch = adminDb.batch();
    batch.set(DOC, {
      plannerRollout: next,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: caller.email ?? caller.uid,
    }, { merge: true });
    await logSettingsChange({
      area: 'planner',
      summary: 'Changed who has the new Planner',
      caller,
      before: { stage: PLANNER_STAGE_LABEL[before.stage], chosenEmails: before.chosenEmails.join(', ') || 'Nobody' },
      after:  { stage: PLANNER_STAGE_LABEL[next.stage],   chosenEmails: next.chosenEmails.join(', ') || 'Nobody' },
      labels: { stage: 'Who has it', chosenEmails: 'People chosen' },
    }, batch);
    await batch.commit();
    return NextResponse.json({ rollout: next });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
