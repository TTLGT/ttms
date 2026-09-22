import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminDb, AdminAuthError, requirePermission, requireCompanyUser } from '@/lib/firebase-admin';
import { DEFAULT_APP_SETTINGS, isDateFormat, isLaneDistanceMode } from '@/types/appSettings';
import {
  DEFAULT_CELEBRATION_TEMPLATES,
  validateTemplate,
  type CelebrationTemplates,
} from '@/types/celebration';
import type { Permission } from '@/types/permission';

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
      celebrations: typeof stored?.celebrations === 'boolean'
        ? stored.celebrations
        : DEFAULT_APP_SETTINGS.celebrations,
      // Per template, not all-or-nothing: an entry that somehow holds a good
      // birthday line and a bad anniversary one should keep the good half.
      celebrationTemplates: readTemplates(stored?.celebrationTemplates),
    },
    // Whether the Google Routes option can actually work, so the Settings page
    // can warn before an admin picks a mode that would silently do nothing.
    // Reports only that a key exists — never any part of its value.
    routesKeyConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY),
  });
}

/**
 * Which keys in this document each permission may write.
 *
 * Two owners, not one. `settings.manage` is how the company works — lane
 * mileage, the date format; `celebrations.manage` is what the company says on
 * somebody's birthday, which is HR's and is deliberately not bundled with the
 * rest. An admin holds both, so nothing changes for them.
 *
 * The guard is per key rather than per request, so a body naming one of each
 * has to satisfy both. Nothing sends such a body today — each panel posts only
 * what it changed — but a request that could get one key in on the strength of
 * another is the kind of hole nobody finds by using the screen.
 */
const SETTING_OWNERS: { permission: Permission; keys: string[] }[] = [
  { permission: 'settings.manage',      keys: ['laneDistanceMode', 'dateFormat'] },
  { permission: 'celebrations.manage',  keys: ['celebrations', 'celebrationTemplates'] },
];

/** Stored wording, with the default substituted for anything unusable. */
function readTemplates(raw: unknown): CelebrationTemplates {
  const stored = (raw ?? {}) as Partial<CelebrationTemplates>;
  const pick = (kind: keyof CelebrationTemplates): string => {
    const text = typeof stored[kind] === 'string' ? stored[kind] : '';
    return validateTemplate(kind, text) === '' ? text.trim() : DEFAULT_CELEBRATION_TEMPLATES[kind];
  };
  return { birthday: pick('birthday'), anniversary: pick('anniversary') };
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // Read before the guard, because the guard depends on what is being written.
  // Nothing is written before every permission it needs has been checked.
  const needed = SETTING_OWNERS
    .filter((owner) => owner.keys.some((key) => key in body))
    .map((owner) => owner.permission);

  if (needed.length === 0) {
    return NextResponse.json({ error: 'No setting was named.' }, { status: 400 });
  }

  let caller;
  try {
    for (const permission of needed) caller = await requirePermission(req, permission);
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

  if ('celebrations' in body) {
    if (typeof body.celebrations !== 'boolean') {
      return NextResponse.json({ error: 'Celebrations must be on or off.' }, { status: 400 });
    }
    patch.celebrations = body.celebrations;
  }

  if ('celebrationTemplates' in body) {
    const raw = body.celebrationTemplates;
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json({ error: 'The message wording is missing.' }, { status: 400 });
    }

    // Checked again here rather than trusted from the editor. The panel
    // validates as somebody types so they are told before they save, but the
    // browser is not where a rule lives, and this document is read straight
    // into a message that goes to the whole company.
    const templates: CelebrationTemplates = { birthday: '', anniversary: '' };
    for (const kind of ['birthday', 'anniversary'] as const) {
      const text = typeof raw[kind] === 'string' ? raw[kind] : '';
      const problem = validateTemplate(kind, text);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      templates[kind] = text.trim();
    }
    patch.celebrationTemplates = templates;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No setting was named.' }, { status: 400 });
  }

  await DOC.set(
    {
      ...patch,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: caller?.email ?? caller?.uid ?? 'unknown',
    },
    { merge: true },
  );

  return NextResponse.json({ settings: patch });
}
