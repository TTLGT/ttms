import { NextRequest, NextResponse } from 'next/server';
import {
  markGuide,
  myProgram,
  onboardingCaller,
  onboardingErrorResponse,
  setStep,
  submitSurvey,
  unmarkGuide,
} from '@/lib/onboardingServer';

/**
 * The caller's own onboarding programme. No parameter for whose — it is the
 * verified email off the ID token, as on /api/me.
 *
 * `manages` and `leadsTeam` tell the page whether to offer Team progress; a
 * courtesy only, since /api/onboarding/people checks for itself.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await onboardingCaller(req);
    const program = await myProgram(caller);
    const leadsTeam = caller.profile?.isSalesManager === true
      && ((caller.profile.managedUids?.length ?? 0) + (caller.profile.managedEmails?.length ?? 0) > 0);
    return NextResponse.json({ program, manages: caller.manages, leadsTeam, name: caller.name });
  } catch (e) {
    const { error, status } = onboardingErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

/**
 * One thing at a time, named by `action`:
 *   tick / untick  { stepId }               — a step the caller may tick on their own programme
 *   guide          { guideId, score, total } — finished a guide
 *   unguide        { guideId }              — read it again
 *   survey         { surveyId, answers }    — once per survey
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await onboardingCaller(req);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    switch (body.action) {
      case 'tick':
      case 'untick':
        if (typeof body.stepId !== 'string') return NextResponse.json({ error: 'Which step?' }, { status: 400 });
        await setStep(caller, caller.email, body.stepId, body.action === 'tick');
        break;
      case 'guide':
        await markGuide(caller, body.guideId, body.score, body.total);
        break;
      case 'unguide':
        await unmarkGuide(caller, body.guideId);
        break;
      case 'survey':
        await submitSurvey(caller, body.surveyId, body.answers);
        break;
      default:
        return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }
    return NextResponse.json({ program: await myProgram(caller) });
  } catch (e) {
    const { error, status } = onboardingErrorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
