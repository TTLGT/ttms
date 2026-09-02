'use client';

import { ListChecks } from 'lucide-react';
import ComingSoon from '@/components/intern/ComingSoon';

/** The intern task list. Content to come — see the note in the intern layout. */
export default function InternTasksPage() {
  return (
    <ComingSoon
      Icon={ListChecks}
      title="Your task list is not set up yet"
      detail="This is where the work assigned to you will appear, with what is done and what is still open. Your manager will let you know when there is something here."
    />
  );
}
