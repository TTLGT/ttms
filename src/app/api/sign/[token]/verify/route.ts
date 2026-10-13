import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebase-admin';
import {
  MAX_VERIFY_FAILURES, SIGN_ACCESS_MAX_AGE,
  isVerifyLocked, matchesOnFile, newAccessKey, signAccessCookies,
} from '@/lib/signAccess';

type RouteContext = { params: Promise<{ token: string }> };

/**
 * The signer proves who the link is for — an email or phone we hold for
 * them — and the browser is given this link's key. PUBLIC, like the rest of
 * /api/sign/[token]: the signer has no account. See src/lib/signAccess.ts.
 *
 * Every answer says only right or wrong, never which address would have
 * worked or what is on file. Wrong answers are counted on the link, and the
 * tenth locks it until the agreement is sent again.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { token } = await params;
  if (!/^[a-f0-9]{16,128}$/i.test(token)) {
    return NextResponse.json({ error: 'This signing link is not valid.' }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { value?: unknown };
  // Capped: it is the caller's to write, and it is only ever compared.
  const value = typeof body.value === 'string' ? body.value.slice(0, 200) : '';
  if (!value.trim()) {
    return NextResponse.json({ error: 'Type your email address or phone number.' }, { status: 400 });
  }

  const ref  = adminDb.collection('signing_tokens').doc(token);
  const snap = await ref.get();
  const data = snap.data();
  if (!data) {
    return NextResponse.json({ error: 'This signing link is not valid.' }, { status: 404 });
  }
  if (data.revokedAt || (data.replacedAt && !data.usedAt)) {
    return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 410 });
  }
  if (isVerifyLocked(data)) {
    return NextResponse.json({ error: lockedMessage() }, { status: 429 });
  }

  if (!(await matchesOnFile(data, value))) {
    await ref.update({ verifyFailures: FieldValue.increment(1) });
    const left = MAX_VERIFY_FAILURES - (Number(data.verifyFailures ?? 0) + 1);
    return NextResponse.json({
      error: left > 0
        ? `That does not match what we have on file for this agreement. ${left} ${left === 1 ? 'try' : 'tries'} left.`
        : lockedMessage(),
    }, { status: left > 0 ? 403 : 429 });
  }

  /*
   * One key per link, made on the first right answer and kept. In a
   * transaction so that two devices answering at once agree on it — one
   * overwriting the other's would quietly let the first back out.
   */
  const key = await adminDb.runTransaction(async (tx) => {
    const fresh = (await tx.get(ref)).data() ?? {};
    if (typeof fresh.accessKey === 'string' && fresh.accessKey) return fresh.accessKey as string;
    const made = newAccessKey();
    tx.update(ref, { accessKey: made });
    return made;
  });

  const res = NextResponse.json({ success: true });
  for (const { name, path } of signAccessCookies(token)) {
    res.cookies.set(name, key, {
      path,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SIGN_ACCESS_MAX_AGE,
    });
  }
  return res;
}

function lockedMessage(): string {
  return 'Too many tries. Please ask your dispatcher to send the agreement again, and use the new email.';
}
