'use client';

import CalendarScreen from '@/components/calendar/CalendarScreen';
import { OldPlannerPage } from '@/components/planner/PlannerSwitch';

/**
 * The Calendar. The screen itself is src/components/calendar/CalendarScreen.tsx,
 * which the Planner's Calendar tab shows too; this address stays for
 * everybody not on the Planner, and sends those who are to that tab. See
 * src/types/planner.ts.
 */
export default function Page() {
  return (
    <OldPlannerPage tab="calendar">
      <CalendarScreen />
    </OldPlannerPage>
  );
}
