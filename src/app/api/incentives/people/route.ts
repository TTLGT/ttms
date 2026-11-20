import { NextRequest, NextResponse } from 'next/server';
import { incentiveCaller, incentiveErrorResponse, listPeople } from '@/lib/incentivesServer';

/**
 * Who can be added to a month: signed in at least once, not suspended, not an
 * intern. Names and emails only. `incentives.manage`, checked in listPeople().
 *
 * A static segment beside `[month]`; Next matches it first, and "people" is
 * never a month id anyway.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await incentiveCaller(req);
    return NextResponse.json({ people: await listPeople(caller) });
  } catch (e) {
    const { error, status } = incentiveErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
