import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, requirePermission } from '@/lib/firebase-admin';
import { runCelebrations } from '@/lib/celebrations';
import { isCalendarDate } from '@/types/allowedUser';

/**
 * The daily congratulations post, and the preview of it.
 *
 * `GET` is the scheduled run and is called by nothing but the Vercel cron
 * declared in vercel.json. `POST` is an admin asking what it would say, and
 * never writes anything.
 *
 * Guarded like every other route in this app, and for once the guard is not a
 * signed-in user: see below.
 */

export const maxDuration = 30;

/**
 * Whether this request really is the cron.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` on every scheduled
 * invocation when that variable is set on the project. Two things about this
 * are worth being explicit about, because getting either wrong turns the
 * Everyone room into something anybody on the internet can write to:
 *
 *  - **A missing secret refuses the request rather than allowing it.** An
 *    endpoint that posts to the whole company must not fall open because an
 *    environment variable was not set; the failure mode of refusing is a quiet
 *    morning, and the failure mode of allowing is a stranger in the room.
 *  - **The comparison is timing-safe**, which for a shared secret in a header
 *    is cheap enough that there is no reason to compare it any other way.
 */
function isCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const offered = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length, so the lengths are settled first and the compare still runs.
  if (offered.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(offered), Buffer.from(expected));
}

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
