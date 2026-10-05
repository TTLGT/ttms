'use client';

import { Check, Crosshair, Flame, ListChecks, Pencil, Zap } from 'lucide-react';
import type { PersonalTask } from '@/types/task';
import { nextStepOf } from '@/types/task';
import type { TaskStreak } from '@/types/taskStreak';
import { DueChip } from './TaskQueue';
import XpBadge from './XpBadge';
import { PLAIN_SKIN, type TaskSkin } from './taskSkins';

/**
 * The one thing to do next, at the top of My tasks whatever view is open —
 * the closest deadline, see upNextTask(). When the task has steps the big
 * line is the next step and the task's name sits above it, so "Done" always
 * means the very next thing: it ticks that step, and on the last step it
 * finishes the task as well.
 */
export function UpNextCard({
  task,
  number,
  today,
  playing,
  skin = PLAIN_SKIN,
  onAdvance,
  onFocus,
  onOpen,
}: {
  task: PersonalTask | null;
  /** Its place in the queue. */
  number: number | null;
  today: string;
  playing: boolean;
  skin?: TaskSkin;
  onAdvance: (task: PersonalTask) => void;
  onFocus: (task: PersonalTask) => void;
  onOpen: (task: PersonalTask) => void;
}) {
  // The plain look is the brand blue; a theme brings its own accent.
  const accent = skin.themed ? skin.accent : undefined;

  if (!task) {
    return (
      <div className="flex h-full items-center rounded-xl border border-dashed border-gray-300 bg-white px-5 py-6 text-sm text-gray-500">
        Nothing in your queue. Add a task and it shows up here.
      </div>
    );
  }

  const step = nextStepOf(task);
  const stepsDone = task.steps.filter((s) => s.done).length;
  const lastStep = !!step && task.steps.length - stepsDone === 1;

  return (
    <section
      aria-label={skin.upNext}
      className={`h-full rounded-xl border-2 bg-white px-5 py-4 shadow-sm ${accent ? '' : 'border-brand-500'}`}
      style={accent ? { borderColor: accent } : undefined}
    >
      <div className="flex items-center gap-2">
        <p
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-brand-700"
          style={accent ? { color: 'var(--tt-accent-ink)' } : undefined}
        >
          <Zap size={13} /> {step ? `Your next ${skin.step}` : skin.upNext}
        </p>
        {number !== null && <span className="text-xs text-gray-400">#{number} in your {skin.queue.toLowerCase()}</span>}
        <button
          type="button"
          onClick={() => onOpen(task)}
          aria-label="Edit this task"
          className="ml-auto rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <Pencil size={14} />
        </button>
      </div>

      {step && <p className="mt-1.5 truncate text-sm text-gray-500">{task.title}</p>}
      <h2 className={`mt-0.5 text-xl font-bold leading-snug text-gray-900 ${skin.heading}`}>
        {step ? step.title : task.title}
      </h2>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        {task.date && <DueChip date={task.date} time={task.time} today={today} />}
        {task.steps.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <ListChecks size={12} /> {stepsDone}/{task.steps.length} {skin.steps}
          </span>
        )}
        {playing && <XpBadge task={task} today={today} theme={skin.id} />}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => onAdvance(task)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
        >
          <Check size={16} strokeWidth={3} />
          {!step ? 'Done' : lastStep ? `Done — finishes the task` : `Done — next ${skin.step}`}
        </button>
        <button
          type="button"
          onClick={() => onFocus(task)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Crosshair size={15} /> Focus
        </button>
      </div>
    </section>
  );
}

/**
 * The streak with game mode off — see src/types/taskStreak.ts. Game mode has
 * its own on the banner, which also pays and charges XP; this one only counts.
 */
export function StreakCard({ streak }: { streak: TaskStreak }) {
  const alive = streak.current > 0;
  const today = streak.todayTasks + streak.todaySteps;
  return (
    <section aria-label="Your streak" className="flex h-full flex-col justify-center rounded-xl border border-gray-200 bg-white px-5 py-4">
      <div className="flex items-center gap-3">
        <span className={`grid h-12 w-12 flex-shrink-0 place-items-center rounded-full ${alive ? 'bg-orange-50 text-orange-500' : 'bg-gray-100 text-gray-400'}`}>
          <Flame size={26} />
        </span>
        <div>
          <p className="text-2xl font-bold leading-none text-gray-900">
            {streak.current} <span className="text-sm font-medium text-gray-500">day{streak.current === 1 ? '' : 's'} in a row</span>
          </p>
          <p className="mt-1 text-xs text-gray-500">Longest: {streak.longest} day{streak.longest === 1 ? '' : 's'}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-gray-700">
        <span className="font-semibold">{today}</span> done today
        <span className="text-gray-500"> · {streak.totalTasks + streak.totalSteps} all-time</span>
      </p>
      <p className="mt-1 text-xs text-gray-500">
        {today > 0
          ? 'Streak safe for today.'
          : alive ? 'Finish a task or a step today to keep it going.' : 'Finish a task or a step to start a streak.'}
        {' '}Weekdays only; holidays and time off do not break it.
      </p>
    </section>
  );
}
