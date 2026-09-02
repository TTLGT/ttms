'use client';

import { BookOpen } from 'lucide-react';
import ComingSoon from '@/components/intern/ComingSoon';

/** The intern guide. Content to come — see the note in the layout beside this. */
export default function InternGuidePage() {
  return (
    <ComingSoon
      Icon={BookOpen}
      title="Your guide is being written"
      detail="This is where the intern guide will live — how the company works, who does what, and what you will be doing week by week. Ask your manager in the meantime."
    />
  );
}
