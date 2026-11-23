'use client';

import { HolidaysPanel } from '@/components/attendance/AttendanceSetup';

/**
 * Settings → Holidays: the public holidays the company observes.
 * The same panel as Attendance → Setup, so the two can never differ. Every
 * route behind it checks `attendance.manage` again.
 */
export default function Page() {
  return <HolidaysPanel />;
}
