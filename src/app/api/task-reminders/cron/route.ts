import { NextRequest, NextResponse } from 'next/server';
import { isCron } from '@/lib/cronAuth';
import { runTaskReminders } from '@/lib/personalTaskReminders';

/**
 * Reminders people set on their own tasks and events. Called by nothing but
 * the Vercel cron declared in vercel.json, every five minutes around the
 * clock — a reminder is for whenever somebody set it, not office hours, and a
 * run with nothing due costs one read.
 */

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const run = await runTaskReminders();
  // Counts only. What people are being reminded about stays out of the log.
  return NextResponse.json(run);
}
