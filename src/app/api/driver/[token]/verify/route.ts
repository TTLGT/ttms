import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebase-admin';
import { MAX_VERIFY_FAILURES, SIGN_ACCESS_MAX_AGE, isVerifyLocked, newAccessKey } from '@/lib/signAccess';
import {
  DRIVER_TOKEN_RE,
  driverAccessCookies,
  driverLinkRef,
  driverPhoneMatches,
  linkProblem,
} from '@/lib/driverLinksServer';

type RouteContext = { params: Promise<{ token: string }> };

/**
 * The driver proves the link is theirs by typing the phone number on the
 * load, and the browser is given this link's key. PUBLIC — a driver has no
 * account. The same arrangement as /api/sign/[token]/verify: every answer
 * says only right or wrong, wrong answers are counted on the link, and the
 * tenth locks it until somebody makes a new link.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { token } = await params;
  if (!DRIVER_TOKEN_RE.test(token)) {
    return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 });
  }
  const body  = (await req.json().catch(() => ({}))) as { value?: unknown };
  const value = typeof body.value === 'string' ? body.value.slice(0, 60) : '';
  if (!value.trim()) return NextResponse.json({ error: 'phone_required' }, { status: 400 });

  const ref  = driverLinkRef(token);
  const link = (await ref.get()).data();
  const order = link ? (await adminDb.collection('orders').doc(String(link.orderId)).get()).data() : undefined;
  const problem = linkProblem(link, order);
  if (problem) return NextResponse.json({ error: problem }, { status: 410 });
  if (isVerifyLocked(link!)) return NextResponse.json({ error: 'locked' }, { status: 429 });

  if (!driverPhoneMatches(link!, order!, value)) {
    await ref.update({ verifyFailures: FieldValue.increment(1) });
    const left = MAX_VERIFY_FAILURES - (Number(link!.verifyFailures ?? 0) + 1);
    return NextResponse.json({ error: left > 0 ? 'wrong' : 'locked', left }, { status: left > 0 ? 403 : 429 });
  }

  // One key per link, made on the first right answer — in a transaction so
  // two phones answering at once agree on it.
  const key = await adminDb.runTransaction(async (tx) => {
    const fresh = (await tx.get(ref)).data() ?? {};
    if (typeof fresh.accessKey === 'string' && fresh.accessKey) return fresh.accessKey as string;
    const made = newAccessKey();
    tx.update(ref, { accessKey: made });
    return made;
  });

  const res = NextResponse.json({ success: true });
  for (const { name, path } of driverAccessCookies(token)) {
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
