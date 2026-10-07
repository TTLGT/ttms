import { NextRequest, NextResponse } from 'next/server';
import { adminDb, requireAdmin, AdminAuthError } from '@/lib/firebase-admin';
import { FmcsaNotConfiguredError } from '@/lib/fmcsa';
import { carriersNeedingCheck, sweepCarriers, SWEEP_BATCH } from '@/lib/fmcsaSweep';

// Well past the sweep's own 35-second budget: a lookup already running when the
// budget ends can still wait 30 seconds on FMCSA's census, twice when it goes
// on to ask again by a DOT it has just found.
export const maxDuration = 180;

/**
 * Checking carriers with FMCSA in bulk — see `src/lib/fmcsaSweep.ts`.
 *
 * Admin only, like the BATS import that calls it: it writes to every carrier
 * it is handed. The per-carrier check stays open to anybody with
 * `carriers.view`; this is the same thing done to the whole book at once.
 *
 *   GET  — the ids of carriers never checked, or checked under other numbers.
 *   POST — `{ ids }`, at most SWEEP_BATCH, checked and filled in. Answers with
 *          what happened to each and any it ran out of time for.
 */

async function guard(req: NextRequest) {
  try {
    return { caller: await requireAdmin(req) };
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return { error: NextResponse.json({ error: e.message }, { status: e.status }) };
    }
    throw e;
  }
}

export async function GET(req: NextRequest) {
  const g = await guard(req);
  if (g.error) return g.error;
  return NextResponse.json({ ids: await carriersNeedingCheck() });
}

export async function POST(req: NextRequest) {
  const g = await guard(req);
  if (g.error) return g.error;

  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids)
    ? [...new Set(body.ids.filter((v): v is string => typeof v === 'string' && v.length > 0 && !v.includes('/')))]
    : [];
  if (!ids.length) return NextResponse.json({ error: 'No carriers to check' }, { status: 400 });
  if (ids.length > SWEEP_BATCH) {
    return NextResponse.json({ error: `At most ${SWEEP_BATCH} carriers per request` }, { status: 400 });
  }

  const profile = await adminDb.collection('users').doc(g.caller.uid).get();
  const who = (profile.data()?.displayName as string | undefined)?.trim() || g.caller.email || 'An admin';
  // Says how it was run, so a carrier page reading "Checked by Erwin" for a
  // carrier Erwin never opened is explained.
  const checkedByName = `${who} (bulk check)`;

  try {
    return NextResponse.json(await sweepCarriers(ids, checkedByName));
  } catch (e) {
    if (e instanceof FmcsaNotConfiguredError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    // Not the error's own message: see the key note in lib/fmcsa.
    return NextResponse.json({ error: 'The FMCSA check failed.' }, { status: 500 });
  }
}
