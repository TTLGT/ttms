import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, AdminAuthError } from '@/lib/firebase-admin';
import { UserImportError, importUsersCsv } from '@/lib/userImport';

/**
 * Bulk add and update people on the allowlist from a CSV.
 *
 * Two-step by design: the panel calls this once with `apply` unset to get a
 * plan back, shows the admin exactly which rows would be created and which
 * fields would change, and only calls it again with `apply=true` once they
 * have looked. This writes to the live company directory — there is no undo
 * and no staging copy, so a preview is not a nicety.
 *
 * The preview and the write run identical code over the same file, so what the
 * admin approved is what happens.
 */
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let caller;
  try {
    caller = await requireAdmin(req);
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No CSV file was uploaded.' }, { status: 400 });
  }

  const apply = form.get('apply') === 'true';

  try {
    const report = await importUsersCsv(
      await file.text(),
      { email: caller.email ?? '', uid: caller.uid },
      { apply },
    );
    return NextResponse.json({ report });
  } catch (e) {
    // A problem with the file as a whole — no Email column, empty, too long —
    // is the admin's to fix, so it comes back as a message rather than a 500.
    if (e instanceof UserImportError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
