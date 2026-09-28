import type { DayOutcome, DaySummary } from '@/types/attendance';

/**
 * How each kind of day is drawn — one table, so the grid, the legend, the
 * dashboard card and the profile page cannot colour the same day two ways.
 *
 * Only the families tailwind.config.ts maps for dark mode (see CLAUDE.md), so
 * every cell reads in both themes without a `dark:` class.
 */
export const OUTCOME_STYLE: Record<DayOutcome, { cell: string; short: string }> = {
  working:      { cell: 'bg-green-100 text-green-800 border-green-300', short: 'In' },
  present:      { cell: 'bg-green-50 text-green-800 border-green-200',  short: '✓' },
  notClockedIn: { cell: 'bg-amber-50 text-amber-800 border-amber-200',  short: '?' },
  notIn:        { cell: 'bg-red-50 text-red-700 border-red-200',        short: '…' },
  notYet:       { cell: 'bg-white text-gray-400 border-gray-200',       short: '' },
  absent:       { cell: 'bg-red-100 text-red-800 border-red-300',       short: 'A' },
  holiday:      { cell: 'bg-blue-50 text-blue-700 border-blue-200',     short: 'H' },
  timeOff:      { cell: 'bg-purple-50 text-purple-700 border-purple-200', short: 'T' },
  off:          { cell: 'bg-gray-50 text-gray-300 border-gray-100',     short: '' },
  upcoming:     { cell: 'bg-white text-gray-300 border-gray-100',       short: '' },
};

/** The flags worth a second look on a present day — shown as a mark in the cell. */
export function dayFlags(s: DaySummary): string[] {
  const flags: string[] = [];
  if (s.lateMinutes > 0) flags.push(`Late ${Math.round(s.lateMinutes)}m`);
  if (s.earlyMinutes > 0) flags.push(`Left ${Math.round(s.earlyMinutes)}m early`);
  if (s.missedClockOut) flags.push('Missed clock-out');
  if (s.newDevice) flags.push('New device');
  return flags;
}

/** Amber when the day is attended but not clean. */
export function cellClass(s: DaySummary): string {
  if (s.outcome === 'present' && dayFlags(s).length > 0) return 'bg-amber-50 text-amber-800 border-amber-300';
  return OUTCOME_STYLE[s.outcome].cell;
}

/** The legend under the grid, in the order people read a month. */
export const LEGEND: { outcome: DayOutcome | 'flagged'; label: string; cell: string }[] = [
  { outcome: 'present',      label: 'Present',                 cell: OUTCOME_STYLE.present.cell },
  { outcome: 'flagged',      label: 'Late, early or flagged',  cell: 'bg-amber-50 text-amber-800 border-amber-300' },
  { outcome: 'notClockedIn', label: 'Active, never clocked in', cell: OUTCOME_STYLE.notClockedIn.cell },
  { outcome: 'absent',       label: 'Absent',                  cell: OUTCOME_STYLE.absent.cell },
  { outcome: 'holiday',      label: 'Holiday',                 cell: OUTCOME_STYLE.holiday.cell },
  { outcome: 'timeOff',      label: 'Time off',                cell: OUTCOME_STYLE.timeOff.cell },
  { outcome: 'off',          label: 'Not scheduled',           cell: OUTCOME_STYLE.off.cell },
];
