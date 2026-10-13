import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { agreementFileName, agreementPdf, voidNoteFor } from '@/lib/signedAgreements';
import { SIGN_API_COOKIE, hasSignAccess } from '@/lib/signAccess';

type RouteContext = { params: Promise<{ token: string }> };

// One PDF render. The headroom is a cold start.
export const maxDuration = 30;

/**
 * The client's own copy of the agreement they signed. PUBLIC, like
 * POST /api/sign/[token] beside it: the client has no account, and the
 * unguessable token in the link, plus the cookie a browser earns by typing an
 * email or phone we hold for them (src/lib/signAccess.ts) — the same two
 * things that let them read and sign it.
 *
 * It answers only for a client or carrier link that has been **signed** and
 * not cancelled, and only with the copy stored on the link — the version they
 * signed, with their own signature record. An unsigned link gives nothing
 * here: the page itself already shows what it says. A cancelled one (the
 * load moved to another client) gives nothing either; that link must stop
 * showing anything at all. A link on hold while a change is reviewed still
 * holds the version they signed, so it is still theirs to download.
 *
 * Not refused once expired: expiry stops signing, and a signed document
 * should stay retrievable from the link it was signed on.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { token } = await params;
  if (!/^[a-f0-9]{16,128}$/i.test(token)) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
  }
  const snap = await adminDb.collection('signing_tokens').doc(token).get();
  const d = snap.data();
  // `shipper_agreement` is the client's load confirmation; the name is
  // historical. A carrier's signed rate confirmation is theirs the same way.
  if (!d || (d.type !== 'shipper_agreement' && d.type !== 'carrier_agreement') || d.revokedAt || !d.usedAt) {
    return NextResponse.json({ error: 'There is no signed agreement on this link.' }, { status: 404 });
  }
  // Same answer as an unsigned link: a browser that has not confirmed who it
  // is learns nothing about whether this one was signed.
  if (!hasSignAccess(d, req.cookies.get(SIGN_API_COOKIE)?.value)) {
    return NextResponse.json({ error: 'There is no signed agreement on this link.' }, { status: 404 });
  }
  // Still the copy they signed — but stamped VOID if a later agreement has
  // replaced it (a carrier's, once the load went out to somebody else), so
  // the signer's own download says it no longer stands.
  const voidNote = await voidNoteFor(d, d, true);
  const buffer = await agreementPdf(d, voidNote, token);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${agreementFileName(d, Boolean(voidNote)).replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
