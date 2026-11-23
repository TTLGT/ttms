'use client';

import { LunchAndBreaks } from '@/components/attendance/AttendanceSetup';

/**
 * Settings → Lunch and breaks: lunch times, break reminders and Back on time.
 * The same panel as Attendance → Setup, so the two can never differ. Every
 * route behind it checks `attendance.manage` again.
 */
export default function Page() {
  return <LunchAndBreaks />;
}
