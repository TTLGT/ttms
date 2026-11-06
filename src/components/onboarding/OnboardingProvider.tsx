'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getMyOnboarding, postMyOnboarding, type MyOnboarding } from '@/lib/onboarding/client';
import { officeToday } from '@/types/celebration';

/**
 * The signed-in person's own programme, read once for every page under
 * /dashboard/onboarding and kept here, so moving between Journey, Learn and
 * Surveys costs no reads. Each action posts to /api/onboarding/me and takes
 * the programme back from the answer.
 */

interface OnboardingValue {
  data: MyOnboarding | null;
  loading: boolean;
  error: string;
  today: string;
  busy: boolean;
  tick: (stepId: string, done: boolean) => Promise<void>;
  finishGuide: (guideId: string, score?: number, total?: number) => Promise<void>;
  reopenGuide: (guideId: string) => Promise<void>;
  sendSurvey: (surveyId: string, answers: Record<string, number | string>) => Promise<void>;
  clearError: () => void;
}

const Ctx = createContext<OnboardingValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<MyOnboarding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const today = useMemo(() => officeToday(), []);

  useEffect(() => {
    let live = true;
    getMyOnboarding()
      .then((d) => { if (live) setData(d); })
      .catch((e: Error) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const run = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    try {
      const { program } = await postMyOnboarding(body);
      setData((d) => (d ? { ...d, program } : d));
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);

  const value = useMemo<OnboardingValue>(() => ({
    data, loading, error, today, busy,
    tick: (stepId, done) => run({ action: done ? 'tick' : 'untick', stepId }),
    finishGuide: (guideId, score, total) => run({ action: 'guide', guideId, score, total }),
    reopenGuide: (guideId) => run({ action: 'unguide', guideId }),
    sendSurvey: (surveyId, answers) => run({ action: 'survey', surveyId, answers }),
    clearError: () => setError(''),
  }), [data, loading, error, today, busy, run]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboarding(): OnboardingValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useOnboarding outside OnboardingProvider');
  return v;
}
