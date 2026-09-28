'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useAttendance } from '@/context/AttendanceContext';
import { fetchReport } from '@/lib/attendance';
import { normalizeEmail } from '@/lib/accessControl';
import { addDays, officeDateOf, type AttendanceReport } from '@/types/attendance';
import AttendanceGrid from '@/components/attendance/AttendanceGrid';
import AttendancePolicy from '@/components/attendance/AttendancePolicy';
import AttendanceSetup from '@/components/attendance/AttendanceSetup';
import RequestsPanel from '@/components/attendance/RequestsPanel';

/**
 * Attendance for HR, administrators, and a Sales Manager's own team
 * (ideas 13–15, 19). Everybody else's own record is on their profile page.
 *
 * The page is a courtesy, like every page here: /api/attendance/report is
 * what decides whose rows come back, and it decides from the caller's
 * permissions and team, never from anything this page sends.
 */

type Tab = 'report' | 'requests' | 'setup';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return { from, to: addDays(next, -1) };
}

export default function AttendancePage() {
  const { user } = useAuth();
  const { seesOthers, manages, state } = useAttendance();
  const [tab, setTab] = useState<Tab>('report');
  const today = officeDateOf(Date.now());
  const [cursor, setCursor] = useState({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { from, to } = monthRange(cursor.year, cursor.month);
    setLoading(true);
    setError('');
    try {
      setReport(await fetchReport(from, to, 'visible'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load attendance');
    } finally {
      setLoading(false);
    }
  }, [cursor]);

  useEffect(() => { if (seesOthers) void load(); }, [seesOthers, load]);

  const step = (by: number) => setCursor(({ year, month }) => {
    const m = month + by;
    return m < 1 ? { year: year - 1, month: 12 } : m > 12 ? { year: year + 1, month: 1 } : { year, month: m };
  });

  // Still asking, or nobody but themselves to see.
  if (!state) return <div className="p-8 text-sm text-gray-500">Loading…</div>;
  if (!seesOthers) {
    return (
      <div className="mx-auto max-w-xl p-8 text-sm text-gray-600">
        Your own attendance is on <Link href="/dashboard/profile" className="text-brand-600 underline">your profile page</Link>.
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'report', label: 'Report' },
    ...(manages ? [{ id: 'requests' as Tab, label: 'Requests' }, { id: 'setup' as Tab, label: 'Setup' }] : []),
  ];

  return (
    <div className="mx-auto max-w-[96rem] space-y-5 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
          <p className="mt-1 text-sm text-gray-500">
            {manages ? 'Everybody’s clock times, breaks and days off.' : 'Your team’s clock times, breaks and days off.'} Times are office time (Guatemala).
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {tabs.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'report' && (
        <>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => step(-1)} aria-label="Previous month" className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100"><ChevronLeft size={18} /></button>
            <span className="min-w-[10rem] text-center text-base font-semibold text-gray-900">{MONTHS[cursor.month - 1]} {cursor.year}</span>
            <button type="button" onClick={() => step(1)} aria-label="Next month" className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100"><ChevronRight size={18} /></button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {loading && !report ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : report ? (
            <AttendanceGrid report={report} myEmail={normalizeEmail(user?.email)} manages={manages} onChanged={() => void load()} />
          ) : null}
          <AttendancePolicy />
        </>
      )}

      {tab === 'requests' && manages && (
        <RequestsPanel people={report?.people ?? []} myEmail={normalizeEmail(user?.email)} onChanged={() => void load()} />
      )}

      {tab === 'setup' && manages && <AttendanceSetup />}
    </div>
  );
}
