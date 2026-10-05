import { Coins, Fuel, Medal, Sparkle, Sparkles, Star, Zap, type LucideIcon } from 'lucide-react';
import { lateShare, taskXp, type GameTheme } from '@/types/taskGame';
import type { PersonalTask } from '@/types/task';

/**
 * What XP looks like in each theme's world — a reward, not a status, so none
 * of these repeats a column icon in StatusMark (Sparkles used to be shared
 * with the wizarding Done column, which made the badge read as "done").
 */
const XP_ICONS: Record<GameTheme, LucideIcon> = {
  freight:   Fuel,     // what keeps the truck rolling
  wizarding: Zap,      // a spell's charge
  empire:    Medal,    // honours from the throne
  fairy:     Sparkle,  // a pinch of fairy dust
  space:     Star,
  pirate:    Coins,    // plunder
};

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
 *
 * The icon follows the theme (XP_ICONS above); Sparkles only under the plain
 * look, which never shows XP in practice since game mode always has a theme.
 */
export default function XpBadge({ task, today, theme, className = '' }: {
  task: PersonalTask;
  today: string;
  theme: GameTheme | null;
  className?: string;
}) {
  const Icon = theme ? XP_ICONS[theme] : Sparkles;
  if (task.status === 'done') {
    if (task.xpEarned <= 0) return null;
    return (
      <span
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold opacity-70 ${className}`}
        title="What finishing this task earned"
      >
        <Icon size={10} /> {task.xpEarned} XP earned
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
      <Icon size={10} style={{ color: 'var(--tt-accent-ink)' }} />
      +{xp} XP
      {daysLate > 0 && <span className="font-normal line-through opacity-60">{full}</span>}
    </span>
  );
}
