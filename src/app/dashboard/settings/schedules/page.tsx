'use client';

import { SchedulesPanel } from '@/components/attendance/AttendanceSetup';

/**
 * Settings → Work schedules: when each person is expected in.
 * The same panel as Attendance → Setup, so the two can never differ. Every
 * route behind it checks `attendance.manage` again.
 */
export default function Page() {
  return <SchedulesPanel />;
}
