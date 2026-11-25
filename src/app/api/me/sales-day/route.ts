import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { salesDaysFor, setDayTargets, tap } from '@/lib/salesDayServer';
import { rewardSalesDay } from '@/lib/taskGameServer';
import { officeToday } from '@/types/celebration';
import { isTappedMetric, sellsLoads } from '@/types/salesDay';

/**
 * The caller's own numbers for today — see src/types/salesDay.ts.
 *
 * Same shape as every /api/me route: the uid off the ID token, no parameter
 * for whose, and today is the office's day, never the browser's. Only people
 * who sell (brokers and Sales Managers) have numbers; everybody else is
 * answered `{ day: null }` and the screens draw nothing.
 *
 * `POST { action: 'tap', metric, delta }` — one call, email or referral, up
 * or down by one (a mis-tap is taken back the same way).
 * `POST { action: 'targets', targets }` — today's targets changed for today.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    if (!sellsLoads(caller.profile)) return NextResponse.json({ day: null });
    const [day] = await salesDaysFor([caller.uid], officeToday());
    return NextResponse.json({ day });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    if (!sellsLoads(caller.profile)) {
      return NextResponse.json({ error: 'Daily numbers are for brokers and Sales Managers.' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const today = officeToday();
    if (body?.action === 'tap') {
      if (!isTappedMetric(body.metric) || (body.delta !== 1 && body.delta !== -1)) {
        return NextResponse.json({ error: 'What should be counted?' }, { status: 400 });
      }
      await tap(caller.uid, today, body.metric, body.delta);
    } else if (body?.action === 'targets') {
      await setDayTargets(caller.uid, today, body.targets);
    } else {
      return NextResponse.json({ error: 'What should change?' }, { status: 400 });
    }
    const [day] = await salesDaysFor([caller.uid], today);
    // Game mode's XP for the taps and for meeting every target (step 7).
    // Best-effort: a tap must never fail because of the game.
    const played = day ? await rewardSalesDay(caller.uid, day).catch(() => null) : null;
    return NextResponse.json({ day, game: played?.game ?? null, events: played?.events ?? [] });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
