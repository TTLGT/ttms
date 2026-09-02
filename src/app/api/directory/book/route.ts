import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { canSeeBookOfBusiness } from '@/lib/accessControl';
import { resolveOwnerFilter } from '@/lib/ownerFilter';
import { bookOfBusiness } from '@/lib/bookOfBusiness';

/**
 * How much work one colleague is carrying — the book-of-business panel on a
 * directory page.
 *
 *   ?email=maria@…   whose numbers, by the identifier the directory uses
 *
 * Guarded twice over, and the two guards answer different questions. This one
 * decides whether the reader may be shown a figure about this person at all;
 * lib/bookOfBusiness.ts then decides, record by record, which of that person's
 * loads and clients the reader was already entitled to count. Neither stands in
 * for the other: without the first, anybody could total up a colleague's book;
 * without the second, a widened permission would quietly turn the panel into a
 * way to read past canSeeOrder().
 *
 * 403 rather than an empty answer for somebody who may not look. Zeroes would
 * be a claim about the person — that they are carrying nothing — and the page
 * draws no panel at all in that case anyway.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    const email  = req.nextUrl.searchParams.get('email') ?? '';

    const subject = await resolveOwnerFilter(email);
    // Nobody is set up at that address. 404 rather than 403: the reader is not
    // being refused, there is simply no such colleague.
    if (!subject) {
      return NextResponse.json({ error: 'No such person' }, { status: 404 });
    }

    const allowed = canSeeBookOfBusiness(
      caller.profile,
      { uid: caller.uid, email: caller.email },
      subject,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: 'You cannot see this person’s book of business' },
        { status: 403 },
      );
    }

    return NextResponse.json(await bookOfBusiness(caller, subject));
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
