import { NextRequest, NextResponse } from 'next/server';
import { isCron } from '@/lib/cronAuth';
import { runCelebrationReminders } from '@/lib/celebrationReminders';

/**
 * This morning's birthday and anniversary reminders. Called by nothing but the Vercel cron
 * declared in vercel.json, five minutes after the Everyone-room post so the
 * two never contend for the same minute.
 */

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const run = await runCelebrationReminders();
  // Counts only. The Vercel log is not where birthdays belong.
  return NextResponse.json(run);
}
