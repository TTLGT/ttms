import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, requireCompanyUser } from '@/lib/firebase-admin';
import { searchChat } from '@/lib/chatSearch';

/**
 * Searching chat history.
 *
 * Guarded like every other route here — there is no middleware backstop. The
 * guard is `requireCompanyUser` and nothing narrower on purpose: everybody on
 * the allowlist is staff, and what this returns is limited by the rooms the
 * caller is in rather than by a permission. A permission would suggest there
 * is a kind of staff account that may read chat it is not in, and there is not.
 *
 * The caller's uid comes off the verified token, and the rooms are worked out
 * from it server-side — see src/lib/chatSearch.ts. There is no parameter for
 * whose chat to search, the same way GET /api/me has none for whose record.
 */
export async function GET(req: NextRequest) {
  try {
    const { uid } = await requireCompanyUser(req);

    const q = (req.nextUrl.searchParams.get('q') ?? '').slice(0, 200);
    const result = await searchChat(uid, q);

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
