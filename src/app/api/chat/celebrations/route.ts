import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, requirePermission } from '@/lib/firebase-admin';
import { runCelebrations } from '@/lib/celebrations';
import { isCron } from '@/lib/cronAuth';
import { isCalendarDate } from '@/types/allowedUser';

/**
 * The daily congratulations post, and the preview of it.
 *
 * `GET` is the scheduled run and is called by nothing but the Vercel cron
 * declared in vercel.json. `POST` is an admin asking what it would say, and
 * never writes anything.
 *
 * Guarded like every other route in this app, and for once the guard is not a
 * signed-in user: see isCron() in src/lib/cronAuth.ts.
 */

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!isCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const run = await runCelebrations();
  // The outcome is returned for the Vercel log, which is the only place a
  // person would go to ask why the room was quiet this morning. No names: the
  // log is not the room, and a birthday does not need to be in two places.
  return NextResponse.json({ outcome: run.outcome, date: run.date, count: run.celebrations.length });
}

/**
 * What the message would say, without sending it.
 *
 * `celebrations.manage` rather than a lighter guard because the preview names
 * people and the reason they are being named — which is the payroll data this
 * feature is careful with everywhere else. It is the same permission that edits
 * the wording and holds the switch, so whoever can change what this says can
 * see what it will say. Admin and HR hold it, and HR can already read the
 * birthdays it is built from.
 *
 * `today` is accepted so the wording can be checked against a date that is not
 * this one — a leap day, a morning with four people on it — without waiting
 * for the calendar to come round.
 */
export async function POST(req: NextRequest) {
  try {
    await requirePermission(req, 'celebrations.manage');
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const today = typeof body.today === 'string' && isCalendarDate(body.today) ? body.today : undefined;

  const run = await runCelebrations({ today, preview: true });
  return NextResponse.json({ run });
}
