import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { badgeCount } from '@/lib/itTicketsServer';

/**
 * The number on the IT support nav item: tickets waiting on IT for the IT
 * account, and tickets with an unread answer for anybody else. One count
 * aggregation either way — see badgeCount().
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    return NextResponse.json({ count: await badgeCount(caller) });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
