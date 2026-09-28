import { NextRequest, NextResponse } from 'next/server';
import { isCron } from '@/lib/cronAuth';
import { closeDays } from '@/lib/attendanceJobs';

/**
 * The nightly close: forgotten clock-outs, absences, and each day's verdict.
 * 3am Guatemala time (09:00 UTC) — see closeDays. Called by nothing but the
 * Vercel cron in vercel.json, and refuses everything when CRON_SECRET is unset.
 */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Counts only. Who was absent does not belong in the Vercel log.
  return NextResponse.json(await closeDays());
}
