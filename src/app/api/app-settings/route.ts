import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminDb, AdminAuthError, requireAdmin, requireCompanyUser } from '@/lib/firebase-admin';
import { DEFAULT_APP_SETTINGS, isLaneDistanceMode } from '@/types/appSettings';

const DOC = adminDb.collection('appSettings').doc('general');

/**
 * Company-wide settings. Readable by anyone with access — a broker's order
 * form has to know whether to show a lane distance — but writable only by an
 * admin, like every other collection that shapes how the app behaves.
 */
export async function GET(req: NextRequest) {
  try {
    await requireCompanyUser(req);
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const snap = await DOC.get();
  const stored = snap.exists ? snap.data() : null;

  return NextResponse.json({
    settings: {
      laneDistanceMode: isLaneDistanceMode(stored?.laneDistanceMode)
        ? stored.laneDistanceMode
        : DEFAULT_APP_SETTINGS.laneDistanceMode,
    },
    // Whether the Google Routes option can actually work, so the Settings page
    // can warn before an admin picks a mode that would silently do nothing.
    // Reports only that a key exists — never any part of its value.
    routesKeyConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY),
  });
}

export async function PUT(req: NextRequest) {
  let caller;
  try {
    caller = await requireAdmin(req);
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const mode = body?.laneDistanceMode;

  if (!isLaneDistanceMode(mode)) {
    return NextResponse.json({ error: 'Unknown lane distance mode.' }, { status: 400 });
  }
  if (mode === 'routes' && !process.env.GOOGLE_MAPS_API_KEY) {
    return NextResponse.json(
      { error: 'GOOGLE_MAPS_API_KEY is not set on the server, so Google Routes cannot be used yet.' },
      { status: 400 },
    );
  }

  await DOC.set(
    {
      laneDistanceMode: mode,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: caller.email ?? caller.uid,
    },
    { merge: true },
  );

  return NextResponse.json({ settings: { laneDistanceMode: mode } });
}
