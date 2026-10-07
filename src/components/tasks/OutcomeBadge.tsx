'use client';

import { useDateFormatters } from '@/lib/useDateFormatters';
import { outcomeOf, type PersonalTask } from '@/types/task';
import { OUTCOME_ICON } from './taskStyle';

/**
 * "Not done" or "Rescheduled to Oct 9" beside a closed task — nothing for an
 * open one or a plain Done, which the strike-through already says. The one
 * place the wording lives, so every view reads a day back the same way.
 */
export default function OutcomeBadge({ task, className = '' }: { task: PersonalTask; className?: string }) {
  const { formatCalendarDate } = useDateFormatters();
  const outcome = outcomeOf(task);
  if (!outcome || outcome === 'done') return null;
  const Icon = OUTCOME_ICON[outcome];
  const text = outcome === 'notdone'
    ? 'Not done'
    : task.rescheduledTo ? `Rescheduled to ${formatCalendarDate(task.rescheduledTo)}` : 'Rescheduled';
  return (
    <span className={`inline-flex flex-shrink-0 items-center gap-0.5 rounded px-1 py-px text-[10px] font-semibold not-italic no-underline ${
      outcome === 'notdone' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'
    } ${className}`}>
      <Icon size={10} /> {text}
    </span>
  );
}
