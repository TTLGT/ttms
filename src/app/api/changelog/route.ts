import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, requireCompanyUser } from '@/lib/firebase-admin';
import { canSeeChangelog, toChange, type StoredChange } from '@/types/changelog';
import history from '@/lib/data/changelog.json';

/**
 * The whole Change history, for the IT role account only — see
 * src/types/changelog.ts for why that is an address and not a permission.
 *
 * Everything, in one response, and the page searches it in the browser. It
 * is a couple of hundred entries that grow by a handful a day, it costs no
 * Firestore reads at all, and a search that runs on every keystroke is
 * better done where the list already is than as a round trip each time.
 *
 * requireCompanyUser first so a removed or suspended account is refused the
 * usual way; the address test after it is what narrows it to one account.
 */
export async function GET(req: NextRequest) {
  try {
    const { email } = await requireCompanyUser(req);
    if (!canSeeChangelog(email)) {
      return NextResponse.json({ error: 'The change history is not available to this account.' }, { status: 403 });
    }

    const changes = (history.changes as StoredChange[]).map(toChange);
    return NextResponse.json({ changes });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
