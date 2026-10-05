import { Sparkles } from 'lucide-react';
import { lateShare, taskXp } from '@/types/taskGame';
import type { PersonalTask } from '@/types/task';

/**
 * What a task is worth in game mode: "+30 XP" while it is open, "30 XP
 * earned" once it is done.
 *
 * The open figure comes from taskXp(), the same function the server pays
 * from, so it already counts the late discount and the suggestion bonus. It
 * leaves out the streak's daily bonus, which belongs to the day rather than
 * the task — the first task finished today earns it, whichever that is.
 *
 * A finished task shows `xpEarned`, what was actually paid, rather than
 * recomputing it: the late discount depends on the day it was finished.
 *
 * `today` is the browser's date and the server pays on the office's, so
 * around midnight the two can differ by one late step. Not worth a round
 * trip for a hint.
 */
export default function XpBadge({ task, today, className = '' }: {
  task: PersonalTask;
  today: string;
  className?: string;
}) {
  if (task.status === 'done') {
    if (task.xpEarned <= 0) return null;
    return (
      <span
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold opacity-70 ${className}`}
        title="What finishing this task earned"
      >
        <Sparkles size={10} /> {task.xpEarned} XP earned
      </span>
    );
  }

  const { xp, full, daysLate } = taskXp(task, today);
  const title = daysLate > 0
    ? `Worth ${full} XP on time. ${daysLate} day${daysLate === 1 ? '' : 's'} late keeps ${Math.round(lateShare(daysLate) * 100)}%.`
    : 'XP for finishing this task';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-700 ${className}`}
      title={title}
    >
      <Sparkles size={10} style={{ color: 'var(--tt-accent-ink)' }} />
      +{xp} XP
      {daysLate > 0 && <span className="font-normal line-through opacity-60">{full}</span>}
    </span>
  );
}
