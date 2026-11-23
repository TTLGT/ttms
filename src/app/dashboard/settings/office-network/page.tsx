'use client';

import { NetworkPanel } from '@/components/attendance/AttendanceSetup';

/**
 * Settings → Office network: the office internet address and the “not in yet” alerts.
 * The same panel as Attendance → Setup, so the two can never differ. Every
 * route behind it checks `attendance.manage` again.
 */
export default function Page() {
  return <NetworkPanel />;
}
