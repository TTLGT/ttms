import { NextRequest, NextResponse } from 'next/server';
import { isCron } from '@/lib/cronAuth';
import { runPlannerNudge } from '@/lib/plannerNudge';

/**
 * The Planner's 10:00 nudge — see lib/plannerNudge.ts. Called by nothing but
 * the Vercel cron declared in vercel.json: `0 16 * * 1-5`, which is 10:00 in
 * Guatemala all year (UTC−6, no daylight saving), weekdays only.
 */

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Counts only — who was nudged stays out of the log.
  return NextResponse.json(await runPlannerNudge());
}
