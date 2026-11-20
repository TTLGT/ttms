import { NextRequest, NextResponse } from 'next/server';
import { getMonth, incentiveCaller, incentiveErrorResponse, officeMonth } from '@/lib/incentivesServer';

/**
 * This month's incentives (office time), for anybody signed in. The page asks
 * here first so it never has to work out "this month" in a browser that may
 * be in another time zone. See src/types/incentive.ts.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await incentiveCaller(req);
    return NextResponse.json({ ...(await getMonth(caller, officeMonth())), current: officeMonth() });
  } catch (e) {
    const { error, status } = incentiveErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
