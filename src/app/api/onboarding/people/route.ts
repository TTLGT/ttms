import { NextRequest, NextResponse } from 'next/server';
import { listProgress, onboardingCaller, onboardingErrorResponse } from '@/lib/onboardingServer';

/**
 * Everybody's onboarding progress the caller may see: the whole company for
 * `onboarding.manage`, their own team for a Sales Manager, a 403 for anybody
 * else. Never carries survey answers — those are on one person's page only.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await onboardingCaller(req);
    const people = await listProgress(caller);
    return NextResponse.json({ people, manages: caller.manages });
  } catch (e) {
    const { error, status } = onboardingErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
