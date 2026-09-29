import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, FieldValue, requireCompanyUser } from '@/lib/firebase-admin';
import { taskOwnerDoc, toReminderSettings } from '@/lib/personalTasksServer';

/**
 * How the caller's own task and event reminders reach them: email, a private
 * chat message, or both. Read along with the list by GET /api/me/tasks.
 *
 * Separate from the celebration reminder settings on purpose — HR turning off
 * birthday emails should not silence their own 10:00 call.
 */
export async function PUT(req: NextRequest) {
  try {
    const { uid } = await requireCompanyUser(req);
    const body = await req.json().catch(() => ({}));
    const settings = toReminderSettings(body);
    await taskOwnerDoc(uid).set(
      { reminderSettings: settings, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return NextResponse.json({ settings });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
