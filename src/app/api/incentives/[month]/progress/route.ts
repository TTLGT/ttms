import { NextRequest, NextResponse } from 'next/server';
import { incentiveCaller, incentiveErrorResponse, recordMark } from '@/lib/incentivesServer';

/**
 * Records one person's standing on one goal, or on the prize:
 *   { uid, goalId, value?, done?, na?, note? }   — goalId 'prize' for the prize
 *
 * `incentives.record` for anybody taking part; a Sales Manager for their own
 * team. recordMark() decides, inside the transaction that writes the log.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ month: string }> }) {
  try {
    const caller = await incentiveCaller(req);
    const { month } = await params;
    const body = await req.json().catch(() => null);
    return NextResponse.json({ progress: await recordMark(caller, month, body) });
  } catch (e) {
    const { error, status } = incentiveErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
