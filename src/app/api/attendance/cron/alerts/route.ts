import { NextRequest, NextResponse } from 'next/server';
import { isCron } from '@/lib/cronAuth';
import { runLateAlerts } from '@/lib/attendanceJobs';

/**
 * "Not in yet" alerts, every fifteen minutes through office hours. See
 * runLateAlerts. Cron only, like the nightly close.
 */
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!isCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Counts only, like the nightly close.
  return NextResponse.json(await runLateAlerts());
}
