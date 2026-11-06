import { NextRequest, NextResponse } from 'next/server';
import {
  onboardingCaller,
  onboardingErrorResponse,
  personProgress,
  setStep,
  setupProgram,
} from '@/lib/onboardingServer';

/**
 * One person's programme. Visible to themselves, to `onboarding.manage`, and
 * to a Sales Manager for their own team; survey answers only to the first
 * two. Anybody else gets the same 404 as an address that does not exist.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ email: string }> }) {
  try {
    const caller = await onboardingCaller(req);
    const { email } = await params;
    return NextResponse.json(await personProgress(caller, decodeURIComponent(email)));
  } catch (e) {
    const { error, status } = onboardingErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

/**
 *   tick / untick { stepId, note? } — `mayTick()` decides, per step
 *   setup         { track?, startDate?, mentorName? } — `onboarding.manage` only
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ email: string }> }) {
  try {
    const caller = await onboardingCaller(req);
    const { email: raw } = await params;
    const email = decodeURIComponent(raw);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action === 'tick' || body.action === 'untick') {
      if (typeof body.stepId !== 'string') return NextResponse.json({ error: 'Which step?' }, { status: 400 });
      await setStep(caller, email, body.stepId, body.action === 'tick', body.note);
    } else if (body.action === 'setup') {
      await setupProgram(caller, email, body);
    } else {
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }
    return NextResponse.json(await personProgress(caller, email));
  } catch (e) {
    const { error, status } = onboardingErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
