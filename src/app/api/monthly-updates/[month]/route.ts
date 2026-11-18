import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, requireCompanyUser } from '@/lib/firebase-admin';
import { isUpdateMonth, type MonthlyUpdate } from '@/types/monthlyUpdate';
import november2026 from '@/lib/data/monthlyUpdates/2026-11.json';

/**
 * One monthly update page, for any allowlisted account — see
 * src/types/monthlyUpdate.ts.
 *
 * A static table rather than a file read by name: the month comes from the
 * URL, and a lookup in a fixed object can only ever answer with a page that
 * was put here on purpose. It also means the bundler ships the files, with no
 * tracing configuration to forget. Costs no Firestore reads beyond the
 * allowlist check.
 */
const UPDATES: Record<string, MonthlyUpdate> = {
  '2026-11': november2026,
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ month: string }> }) {
  try {
    await requireCompanyUser(req);
    const { month } = await params;

    const update = isUpdateMonth(month) && Object.prototype.hasOwnProperty.call(UPDATES, month)
      ? UPDATES[month]
      : null;
    if (!update) {
      return NextResponse.json({ error: 'There is no update for that month.' }, { status: 404 });
    }
    return NextResponse.json(update, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
