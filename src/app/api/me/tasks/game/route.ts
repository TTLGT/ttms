import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, requireCompanyUser } from '@/lib/firebase-admin';
import { setGameOptions } from '@/lib/taskGameServer';
import { isGameTheme } from '@/types/taskGame';

/**
 * Game mode on or off, and which theme its level titles come from — the
 * caller's own, keyed on the uid off the ID token. See src/types/taskGame.ts.
 *
 * XP itself is never written from here. It moves only as a side effect of
 * saving a task, so there is no request that can simply set it.
 */
export async function PUT(req: NextRequest) {
  try {
    const { uid, email } = await requireCompanyUser(req);
    const body = await req.json().catch(() => ({}));
    const game = await setGameOptions(uid, email, {
      enabled: typeof body?.enabled === 'boolean' ? body.enabled : undefined,
      theme: isGameTheme(body?.theme) ? body.theme : undefined,
    });
    return NextResponse.json({ game });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
