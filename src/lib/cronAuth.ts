import { timingSafeEqual } from 'node:crypto';

/**
 * Whether this request really is a Vercel cron.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` on every scheduled
 * invocation when that variable is set on the project. Shared by every route
 * vercel.json schedules, so there is one copy of the two things about it that
 * are worth being explicit about — getting either wrong lets anybody on the
 * internet trigger something that writes to real people:
 *
 *  - **A missing secret refuses the request rather than allowing it.** An
 *    endpoint that posts to the company must not fall open because an
 *    environment variable was not set; the failure mode of refusing is a quiet
 *    morning, and the failure mode of allowing is a stranger with a trigger.
 *  - **The comparison is timing-safe**, which for a shared secret in a header
 *    is cheap enough that there is no reason to compare it any other way.
 */
export function isCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const offered = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length, so the lengths are settled first and the compare still runs.
  if (offered.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(offered), Buffer.from(expected));
}
