import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminDb, AdminAuthError, requirePermission, requireCompanyUser } from '@/lib/firebase-admin';
import { DEFAULT_APP_SETTINGS, isDateFormat, isLaneDistanceMode } from '@/types/appSettings';

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
      dateFormat: isDateFormat(stored?.dateFormat)
        ? stored.dateFormat
        : DEFAULT_APP_SETTINGS.dateFormat,
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
    caller = await requirePermission(req, 'settings.manage');
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  /**
   * One setting per request, named in the body. Each panel sends only what it
   * changed, and a field left out is left alone — a panel that posted the
   * whole document would overwrite a setting it had loaded before someone else
   * changed it.
   */
  const patch: Record<string, unknown> = {};

  if ('laneDistanceMode' in body) {
    const mode = body.laneDistanceMode;
    if (!isLaneDistanceMode(mode)) {
      return NextResponse.json({ error: 'Unknown lane distance mode.' }, { status: 400 });
    }
    if (mode === 'routes' && !process.env.GOOGLE_MAPS_API_KEY) {
      return NextResponse.json(
        { error: 'GOOGLE_MAPS_API_KEY is not set on the server, so Google Routes cannot be used yet.' },
        { status: 400 },
      );
    }
    patch.laneDistanceMode = mode;
  }

  if ('dateFormat' in body) {
    if (!isDateFormat(body.dateFormat)) {
      return NextResponse.json({ error: 'Unknown date format.' }, { status: 400 });
    }
    patch.dateFormat = body.dateFormat;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No setting was named.' }, { status: 400 });
  }

  await DOC.set(
    {
      ...patch,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: caller.email ?? caller.uid,
    },
    { merge: true },
  );

  return NextResponse.json({ settings: patch });
}
