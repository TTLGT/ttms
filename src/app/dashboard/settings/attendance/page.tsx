'use client';

import { useAuth } from '@/context/AuthContext';
import AttendanceSetup from '@/components/attendance/AttendanceSetup';

/**
 * Attendance setup under Settings: schedules, holidays, lunch times, break
 * reminders, Back on time, the office network and alerts. The same component
 * as Attendance → Setup, so the two can never differ.
 *
 * Every panel on it needs `attendance.manage`, and every route behind them
 * checks it again. The tab is shown to anybody with `settings.manage` too
 * (an admin-only tab stays open to admins), so somebody holding that without
 * this gets a sentence rather than a page of panels that answer 403.
 */
export default function SettingsAttendancePage() {
  const { can } = useAuth();
  if (!can('attendance.manage')) {
    return (
      <p className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600">
        Attendance settings need the &ldquo;Manage attendance&rdquo; permission. Admin and HR have it.
      </p>
    );
  }
  return <AttendanceSetup />;
}
