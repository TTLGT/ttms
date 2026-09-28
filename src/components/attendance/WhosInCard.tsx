'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { useAttendance } from '@/context/AttendanceContext';
import { fetchToday } from '@/lib/attendance';
import {
  BREAK_LABEL,
  TIME_OFF_LABEL,
  officeClock,
  type AttendanceReport,
  type DaySummary,
} from '@/types/attendance';

/**
 * Who is in today (idea 18), on the dashboard, for whoever can see anybody
 * else's attendance: HR and administrators everybody, a Sales Manager their
 * team. Nobody else gets the card — and the route answers them with nothing
 * even if they asked.
 *
 * One read per person per load, and only on the dashboard. It is not live:
 * it is a glance, and the Attendance page is where somebody goes to look.
 */

type Group = 'in' | 'break' | 'notIn' | 'left' | 'off' | 'later';

function groupOf(s: DaySummary, onBreak: boolean): Group {
  if (s.outcome === 'working') return onBreak ? 'break' : 'in';
  if (s.outcome === 'notIn' || s.outcome === 'notClockedIn') return 'notIn';
  if (s.outcome === 'notYet') return 'later';
  if (s.outcome === 'present') return 'left'; // clocked in and out again today
  return 'off';
}

const GROUPS: { id: Group; label: string; tone: string }[] = [
  { id: 'in',    label: 'In',           tone: 'text-green-700' },
  { id: 'break', label: 'On a break',   tone: 'text-amber-700' },
  { id: 'notIn', label: 'Not in yet',   tone: 'text-red-700' },
  { id: 'later', label: 'Starts later', tone: 'text-gray-600' },
  { id: 'left',  label: 'Clocked out',  tone: 'text-gray-600' },
  { id: 'off',   label: 'Off today',    tone: 'text-gray-500' },
];

export default function WhosInCard() {
  const { seesOthers } = useAttendance();
  const [report, setReport] = useState<AttendanceReport | null>(null);

  useEffect(() => {
    if (!seesOthers) return;
    fetchToday().then((r) => setReport(r.report)).catch(() => setReport(null));
  }, [seesOthers]);

  if (!seesOthers || !report) return null;

  const rows = report.people.map((p) => {
    const s = report.cells[p.email]?.[report.today];
    const brk = report.onBreak[p.email];
    return s ? { p, s, brk, group: groupOf(s, Boolean(brk)) } : null;
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  // Off-today rows for people who are simply not scheduled say nothing
  // worth a line; holidays and time off do.
  const detail = (r: (typeof rows)[number]): string => {
    if (r.group === 'break') return `${BREAK_LABEL[r.brk!]}`;
    if (r.s.outcome === 'present') return `left ${officeClock(r.s.clockOut!)}`;
    if (r.group === 'in') return `since ${officeClock(r.s.clockIn!)}${r.s.lateMinutes ? ` · ${Math.round(r.s.lateMinutes)}m late` : ''}`;
    if (r.s.outcome === 'notClockedIn') return 'active, not clocked in';
    if (r.group === 'notIn' || r.group === 'later') return r.s.shift ? `due ${r.s.shift.start}` : '';
    if (r.s.timeOff) return TIME_OFF_LABEL[r.s.timeOff];
    if (r.s.holiday) return r.s.holiday;
    return '';
  };

  return (
    <section className="mb-8 rounded-xl border border-gray-200 bg-white shadow-sm">
      <header className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 sm:px-6">
        <CalendarClock size={18} className="text-brand-600" />
        <h2 className="flex-1 font-semibold text-gray-800">Who&rsquo;s in today</h2>
        <Link href="/dashboard/attendance" className="text-sm text-brand-500 hover:underline">Attendance →</Link>
      </header>
      <div className="grid gap-4 p-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-6">
        {GROUPS.map((g) => {
          const list = rows.filter((r) => r.group === g.id && !(g.id === 'off' && r.s.outcome === 'off'));
          return (
            <div key={g.id}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${g.tone}`}>{g.label} · {list.length}</p>
              <ul className="mt-1.5 space-y-1 text-sm">
                {list.map((r) => (
                  <li key={r.p.email} className="truncate text-gray-800" title={detail(r)}>
                    {r.p.name}
                    {detail(r) && <span className="text-gray-500"> — {detail(r)}</span>}
                  </li>
                ))}
                {list.length === 0 && <li className="text-gray-400">Nobody</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
