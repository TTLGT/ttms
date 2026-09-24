import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, requireCompanyUser } from '@/lib/firebase-admin';
import { fetchGifs, GifsUnavailableError } from '@/lib/klipy';
import { MAX_GIF_QUERY } from '@/types/gif';

/**
 * GIF search for the chat picker — Klipy, through our server.
 *
 * Through our server rather than straight from the browser so the API key
 * stays here (see src/lib/klipy.ts). Guarded like every route: without the
 * guard this would be an open door onto our Klipy quota for anybody on the
 * internet.
 *
 * `?q=` searches; no `q` is the trending page. `?page=` is 1-based.
 * Answers 503 with a sentence when the key is missing or Klipy is down, which
 * the picker shows as it is.
 */
export async function GET(req: NextRequest) {
  try {
    await requireCompanyUser(req);

    const q = (req.nextUrl.searchParams.get('q') ?? '').slice(0, MAX_GIF_QUERY);
    const page = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get('page')) || 1));

    return NextResponse.json(await fetchGifs(q, page));
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof GifsUnavailableError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    // A timeout or a network failure reaching Klipy. Not our bug to throw.
    return NextResponse.json({ error: 'The GIF service did not answer. Try again in a moment.' }, { status: 503 });
  }
}
