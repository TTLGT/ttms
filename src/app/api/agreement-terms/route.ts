import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, AdminAuthError, requirePermission } from '@/lib/firebase-admin';
import { agreementTermsDoc } from '@/lib/agreementTermsServer';
import { DEFAULT_CLIENT_TERMS, validateClientTerms } from '@/types/agreementTerms';

/**
 * The terms and conditions on the client's load confirmation. See
 * src/types/agreementTerms.ts.
 *
 * Read and written only from Settings, so both sides are the same people.
 * Nobody else needs the text through here: the send route reads it with the
 * Admin SDK, and the client sees the copy on their own signing token.
 */
const EDITORS = ['settings.manage', 'agreementTerms.manage'] as const;

function deny(e: unknown) {
  if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, [...EDITORS]);
  } catch (e) {
    return deny(e);
  }

  const snap = await agreementTermsDoc().get();
  const stored = snap.exists ? snap.data() : null;
  // Re-validated on the way out, as the quote rates are: a document edited by
  // hand in the Console has been through no check, and the panel should say
  // when what it shows is the default rather than what was saved.
  const checked = stored ? validateClientTerms(stored.client) : null;
  const usable = checked !== null && 'text' in checked;

  return NextResponse.json({
    client: usable ? checked.text : DEFAULT_CLIENT_TERMS,
    isDefault: !usable,
    updatedAt: usable ? stored?.updatedAt?.toDate?.()?.toISOString?.() ?? null : null,
    updatedBy: usable && typeof stored?.updatedBy === 'string' ? stored.updatedBy : null,
  });
}

export async function PUT(req: NextRequest) {
  let caller;
  try {
    caller = await requirePermission(req, [...EDITORS]);
  } catch (e) {
    return deny(e);
  }

  const body = await req.json().catch(() => null);
  const checked = validateClientTerms(body?.client);
  if ('error' in checked) return NextResponse.json({ error: checked.error }, { status: 400 });

  await agreementTermsDoc().set({
    client: checked.text,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: caller.email ?? caller.uid,
  });

  return NextResponse.json({ client: checked.text });
}
