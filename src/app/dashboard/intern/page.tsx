import { redirect } from 'next/navigation';

/** The intern area became My onboarding, for everybody (2026-11-05). */
export default function InternRedirect() {
  redirect('/dashboard/onboarding');
}
