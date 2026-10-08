import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminDb, AdminAuthError, requirePermission } from '@/lib/firebase-admin';
import { DEFAULT_QUOTE_RATES, validateQuoteRates } from '@/types/quoteRates';

/**
 * The quote calculator's rate card. See src/types/quoteRates.ts.
 *
 * Its own document beside `appSettings/general` rather than a key on it: the
 * general document is read on nearly every page, and a list of ten trucks with
 * their limits would make every one of those reads heavier for the sake of one
 * screen.
 */
const DOC = adminDb.collection('appSettings').doc('quoteRates');

/** Anybody who books loads prices them; whoever keeps the card has to see it. */
const READERS = ['orders.create', 'settings.manage', 'quoteRates.manage'] as const;
/** As every narrow Operations permission: a way in beside `settings.manage`, never instead. */
const WRITERS = ['settings.manage', 'quoteRates.manage'] as const;

function deny(e: unknown) {
  if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, [...READERS]);
  } catch (e) {
    return deny(e);
  }

  const snap = await DOC.get();
  const stored = snap.exists ? snap.data() : null;

  // Re-validated on the way out, not trusted because the PUT checked it: a
  // document edited by hand in the Console has been through neither, and a
  // NaN in a rate would put "$NaN" in front of a client. A card that fails is
  // replaced whole by the defaults and the page is told, so an admin knows the
  // numbers on screen are not the ones they saved.
  const checked = stored ? validateQuoteRates(stored) : null;
  const usable = checked && 'ok' in checked;

  return NextResponse.json({
    rates: usable ? checked.ok : DEFAULT_QUOTE_RATES,
    isDefault: !usable,
    problem: checked && 'error' in checked ? checked.error : null,
    updatedAt: usable ? stored?.updatedAt?.toDate?.()?.toISOString?.() ?? null : null,
    updatedBy: usable && typeof stored?.updatedBy === 'string' ? stored.updatedBy : null,
  });
}

/** The whole card in one write — the panel edits a table, not a cell. */
export async function PUT(req: NextRequest) {
  let caller;
  try {
    caller = await requirePermission(req, [...WRITERS]);
  } catch (e) {
    return deny(e);
  }

  const body = await req.json().catch(() => null);
  const checked = validateQuoteRates(body?.rates);
  if ('error' in checked) return NextResponse.json({ error: checked.error }, { status: 400 });

  // set() without merge: the validated card is the whole of the document, so a
  // truck removed in the panel is removed here rather than left behind.
  await DOC.set({
    ...checked.ok,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: caller.email ?? caller.uid,
  });

  return NextResponse.json({ rates: checked.ok });
}
