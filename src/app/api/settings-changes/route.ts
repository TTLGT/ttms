import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, requireCompanyUser } from '@/lib/firebase-admin';
import { isBootstrapAdmin } from '@/lib/accessControl';
import { areasFor, latestSettingsChanges, listSettingsChanges, profileFor } from '@/lib/settingsChangeServer';
import { isSettingsArea } from '@/types/settingsChange';

/**
 * The settings change log, narrowed to what the caller may see.
 *
 * Open to every allowlisted account because the narrowing is the guard: the
 * areas come from the caller's own profile, never from the request, and
 * somebody who may change no setting gets an empty list. `?area=` only narrows
 * further — asking for an area you cannot see answers with nothing.
 */
export async function GET(req: NextRequest) {
  let caller;
  try {
    caller = await requireCompanyUser(req);
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const rawArea = params.get('area');
  const area = isSettingsArea(rawArea) ? rawArea : undefined;
  const limit = Number(params.get('limit')) || undefined;

  const profile = await profileFor(caller.uid);
  const areas = areasFor(profile, isBootstrapAdmin(caller.email));

  // `?latest=a,b` — the newest entry of each named area, for the line under a
  // page title. Reads one small document per area rather than the log.
  const latest = params.get('latest');
  if (latest !== null) {
    const wanted = latest.split(',').filter(isSettingsArea).filter((a) => areas.includes(a));
    return NextResponse.json({ changes: await latestSettingsChanges(wanted), areas });
  }

  const changes = await listSettingsChanges(areas, { area, limit });

  return NextResponse.json({ changes, areas });
}
