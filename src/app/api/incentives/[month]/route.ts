import { NextRequest, NextResponse } from 'next/server';
import { getMonth, incentiveCaller, incentiveErrorResponse, officeMonth, saveProgram } from '@/lib/incentivesServer';

/**
 * One month's incentives. Reading is open to everybody signed in — the
 * scoreboard is public by the office's choice. Saving the set-up needs
 * `incentives.manage`, checked in saveProgram().
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ month: string }> }) {
  try {
    const caller = await incentiveCaller(req);
    const { month } = await params;
    return NextResponse.json({ ...(await getMonth(caller, month)), current: officeMonth() });
  } catch (e) {
    const { error, status } = incentiveErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ month: string }> }) {
  try {
    const caller = await incentiveCaller(req);
    const { month } = await params;
    const body = await req.json().catch(() => null);
    return NextResponse.json({ program: await saveProgram(caller, month, body) });
  } catch (e) {
    const { error, status } = incentiveErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
