import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { TeamPlansRefused, teamPlans } from '@/lib/dayPlansServer';

/**
 * The Calendar's Team plans view: the day plans the people the caller may see
 * have shared, for one day up to a week. Guarded inside `teamPlans()` — it
 * signs the caller in, then refuses anybody who is neither `plans.viewAll`
 * nor a Sales Manager with a team. See src/types/dayPlan.ts.
 */
export async function GET(req: NextRequest) {
  try {
    const from = req.nextUrl.searchParams.get('from') ?? '';
    const to = req.nextUrl.searchParams.get('to') ?? from;
    return NextResponse.json(await teamPlans(req, from, to));
  } catch (e) {
    if (e instanceof AdminAuthError || e instanceof TeamPlansRefused) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
