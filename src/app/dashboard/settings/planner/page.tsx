'use client';

import PlannerRolloutPanel from '@/components/settings/PlannerRolloutPanel';

/**
 * Settings → Planner: who has the new Planner while it is rolled out.
 * Who may open it is decided once, in settingsSections.ts, and enforced by the
 * Settings layout; the route behind the panel checks again.
 */
export default function Page() {
  return <PlannerRolloutPanel />;
}
