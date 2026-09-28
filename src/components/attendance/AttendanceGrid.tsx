'use client';

import { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { downloadCsv, toCsv } from '@/lib/csv';
import {
  ACTIVITY_KINDS,
  ACTIVITY_LABEL,
  OUTCOME_LABEL,
  TIME_OFF_LABEL,
  datesBetween,
  formatMinutes,
  officeHhmm,
  weekdayOf,
  type AttendanceReport,
  type DaySummary,
} from '@/types/attendance';
import DayDetail from './DayDetail';
import { LEGEND, OUTCOME_STYLE, cellClass, dayFlags } from './outcomeStyle';

/**
 * People down the side, days across (idea 13). Each cell is one day's
 * verdict; click it for the day in full.
 *
 * Totals sit at the end of each row rather than in a separate report,
 * because "how many times late this month" is the question asked of the
 * grid, and one screen that answers it beats two that have to agree.
 */

interface Totals {
  present: number;
  absent: number;
  late: number;
  timeOff: number;
  worked: number;
}

function totalsFor(row: Record<string, DaySummary> | undefined): Totals {
  const t: Totals = { present: 0, absent: 0, late: 0, timeOff: 0, worked: 0 };
  for (const s of Object.values(row ?? {})) {
    if (s.outcome === 'present' || s.outcome === 'working') t.present++;
    if (s.outcome === 'absent') t.absent++;
    if (s.outcome === 'timeOff') t.timeOff++;
    if (s.lateMinutes > 0) t.late++;
    t.worked += s.workedMinutes;
  }
  return t;
}

const hours = (minutes: number) => (minutes / 60).toFixed(2);
const csvTime = (ms: number | null) => (ms ? officeHhmm(ms) : '');

export default function AttendanceGrid({
  report, myEmail, manages, onChanged,
}: {
  report: AttendanceReport;
  myEmail: string;
  manages: boolean;
  onChanged: () => void;
}) {
  const [team, setTeam] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<{ email: string; name: string; date: string } | null>(null);

  const dates = useMemo(() => datesBetween(report.from, report.to), [report.from, report.to]);
  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return report.people.filter((p) =>
      (!team || p.teamId === team) && (!q || p.name.toLowerCase().includes(q) || p.email.includes(q)));
  }, [report.people, team, query]);

  function exportDays() {
    const header = [
      'Name', 'Email', 'Date', 'Result', 'Scheduled start', 'Scheduled end',
      'Clock in', 'Clock out', 'Worked hours', 'Break minutes', 'Late minutes', 'Left early minutes',
      'Missed clock-out', 'Office network', 'New device', 'Active minutes', 'Idle minutes',
      'Holiday', 'Time off', ...ACTIVITY_KINDS.map((k) => ACTIVITY_LABEL[k]),
    ];
    const rows = people.flatMap((p) => dates.map((date) => {
      const s = report.cells[p.email]?.[date];
      if (!s) return null;
      const counts = report.activity[p.email]?.[date] ?? {};
      return [
        p.name, p.email, date, OUTCOME_LABEL[s.outcome],
        s.shift?.start ?? '', s.shift?.end ?? '',
        csvTime(s.clockIn), csvTime(s.clockOut),
        s.clockIn ? hours(s.workedMinutes) : '', Math.round(s.breakMinutes) || '',
        Math.round(s.lateMinutes) || '', Math.round(s.earlyMinutes) || '',
        s.missedClockOut ? 'Yes' : '', s.office === null ? '' : s.office ? 'Yes' : 'No', s.newDevice ? 'Yes' : '',
        Math.round(s.activeMinutes), Math.round(s.idleMinutes),
        s.holiday ?? '', s.timeOff ? TIME_OFF_LABEL[s.timeOff] : '',
        ...ACTIVITY_KINDS.map((k) => counts[k] ?? ''),
      ];
    }).filter((r): r is (string | number)[] => r !== null));
    downloadCsv(`attendance-days-${report.from}-to-${report.to}.csv`, toCsv([header, ...rows]));
  }

  /** One row per person — what payroll asks for. */
  function exportTotals() {
    const header = ['Name', 'Email', 'Days present', 'Days absent', 'Days late', 'Days off (time off)', 'Hours worked'];
    const rows = people.map((p) => {
      const t = totalsFor(report.cells[p.email]);
      return [p.name, p.email, t.present, t.absent, t.late, t.timeOff, hours(t.worked)];
    });
    downloadCsv(`attendance-totals-${report.from}-to-${report.to}.csv`, toCsv([header, ...rows]));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a person"
            className="rounded-lg border border-gray-300 py-1.5 pl-8 pr-3 text-sm"
          />
        </label>
        {report.teams.length > 0 && (
          <select value={team} onChange={(e) => setTeam(e.target.value)} className="rounded-lg border border-gray-300 py-1.5 pl-3 pr-8 text-sm">
            <option value="">Every team</option>
            {report.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={exportTotals} className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
            <Download size={14} /> Totals CSV
          </button>
          <button type="button" onClick={exportDays} className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
            <Download size={14} /> Every day CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[10rem] border-b border-gray-200 bg-white px-3 py-2 text-left font-semibold text-gray-700">Person</th>
              {dates.map((d) => {
                const wd = weekdayOf(d);
                return (
                  <th key={d} className={`border-b border-gray-200 px-0.5 py-1 text-center font-medium ${
                    d === report.today ? 'text-brand-700' : wd === 'sat' || wd === 'sun' ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    <div>{wd.charAt(0).toUpperCase()}</div>
                    <div>{Number(d.slice(8))}</div>
                  </th>
                );
              })}
              <th className="border-b border-l border-gray-200 px-2 py-2 text-right font-semibold text-gray-700" title="Days present">In</th>
              <th className="border-b border-gray-200 px-2 py-2 text-right font-semibold text-gray-700" title="Days absent">Abs</th>
              <th className="border-b border-gray-200 px-2 py-2 text-right font-semibold text-gray-700" title="Days late">Late</th>
              <th className="border-b border-gray-200 px-2 py-2 text-right font-semibold text-gray-700" title="Hours worked">Hours</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const t = totalsFor(report.cells[p.email]);
              return (
                <tr key={p.email}>
                  <td className="sticky left-0 z-10 border-b border-gray-100 bg-white px-3 py-1.5">
                    <span className="block max-w-[12rem] truncate font-medium text-gray-900">{p.name}</span>
                  </td>
                  {dates.map((date) => {
                    const s = report.cells[p.email]?.[date];
                    if (!s) return <td key={date} className="border-b border-gray-100" />;
                    const flags = dayFlags(s);
                    const title = [
                      OUTCOME_LABEL[s.outcome],
                      s.holiday, s.timeOff ? TIME_OFF_LABEL[s.timeOff] : null,
                      s.clockIn ? `${csvTime(s.clockIn)}–${csvTime(s.clockOut) || 'now'} · ${formatMinutes(s.workedMinutes)}` : null,
                      ...flags,
                    ].filter(Boolean).join('\n');
                    const clickable = s.outcome !== 'upcoming' && s.outcome !== 'off';
                    return (
                      <td key={date} className="border-b border-gray-100 p-0.5">
                        <button
                          type="button"
                          title={title}
                          disabled={!clickable && !s.clockIn}
                          onClick={() => setOpen({ email: p.email, name: p.name, date })}
                          className={`flex h-7 w-7 items-center justify-center rounded border text-[11px] font-semibold ${cellClass(s)} ${
                            report.onBreak[p.email] && date === report.today ? 'ring-2 ring-amber-300' : ''
                          }`}
                        >
                          {OUTCOME_STYLE[s.outcome].short}
                        </button>
                      </td>
                    );
                  })}
                  <td className="border-b border-l border-gray-100 px-2 text-right tabular-nums text-gray-700">{t.present}</td>
                  <td className={`border-b border-gray-100 px-2 text-right tabular-nums ${t.absent ? 'text-red-700' : 'text-gray-400'}`}>{t.absent}</td>
                  <td className={`border-b border-gray-100 px-2 text-right tabular-nums ${t.late ? 'text-amber-700' : 'text-gray-400'}`}>{t.late}</td>
                  <td className="border-b border-gray-100 px-2 text-right tabular-nums text-gray-700">{hours(t.worked)}</td>
                </tr>
              );
            })}
            {people.length === 0 && (
              <tr><td colSpan={dates.length + 5} className="px-3 py-8 text-center text-sm text-gray-500">Nobody matches.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-600">
        {LEGEND.map((l) => (
          <span key={l.outcome} className="flex items-center gap-1.5">
            <span className={`inline-block h-3.5 w-3.5 rounded border ${l.cell}`} /> {l.label}
          </span>
        ))}
      </div>

      {open && (
        <DayDetail
          email={open.email}
          name={open.name}
          date={open.date}
          summary={report.cells[open.email][open.date]}
          mine={open.email === myEmail}
          canEdit={manages && open.email !== myEmail}
          onClose={() => setOpen(null)}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}
