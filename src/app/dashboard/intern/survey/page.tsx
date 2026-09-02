'use client';

import { ClipboardCheck } from 'lucide-react';
import ComingSoon from '@/components/intern/ComingSoon';

/** The onboarding survey. Content to come — see the note in the intern layout. */
export default function InternSurveyPage() {
  return (
    <ComingSoon
      Icon={ClipboardCheck}
      title="Your onboarding survey is not ready yet"
      detail="When it is, this is where you will fill it in — once, in your first week. Nothing is expected of you here today."
    />
  );
}
