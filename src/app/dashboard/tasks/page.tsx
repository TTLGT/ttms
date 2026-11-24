'use client';

import MyTasksScreen from '@/components/tasks/MyTasksScreen';
import { OldPlannerPage } from '@/components/planner/PlannerSwitch';

/**
 * My tasks. The screen itself is src/components/tasks/MyTasksScreen.tsx,
 * which the Planner's Tasks tab shows too; this address stays for everybody
 * not on the Planner, and sends those who are to that tab. See
 * src/types/planner.ts.
 */
export default function Page() {
  return (
    <OldPlannerPage tab="tasks">
      <MyTasksScreen />
    </OldPlannerPage>
  );
}
