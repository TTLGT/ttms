import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { SalesActivityRefused, leadsBoard } from '@/lib/clientSalesServer';
import { visibleSellers } from '@/lib/salesDayServer';

/**
 * Clients → My leads. `GET` is the caller's own board; `GET ?uid=` is
 * somebody else's, for their Sales Manager or `sales.viewAll` — leadsBoard()
 * refuses anybody else. `GET ?people=1` adds whose boards the caller may
 * open, for the picker; somebody with nobody to look at gets an empty list
 * rather than a refusal, since their own board is still theirs.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    const asked = req.nextUrl.searchParams.get('uid') ?? '';
    const uid = /^[A-Za-z0-9]{1,128}$/.test(asked) ? asked : caller.uid;
    const wantPeople = req.nextUrl.searchParams.get('people') === '1';
    const [leads, people] = await Promise.all([
      leadsBoard(caller, uid),
      wantPeople ? visibleSellers(caller).catch(() => []) : Promise.resolve(null),
    ]);
    return NextResponse.json({
      uid,
      leads,
      ...(people ? { people: people.map((p) => ({ uid: p.uid, name: p.name })) } : {}),
    });
  } catch (e) {
    if (e instanceof SalesActivityRefused) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
