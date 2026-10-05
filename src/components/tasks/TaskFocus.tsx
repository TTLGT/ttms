'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Crosshair, Pencil, RotateCcw, StickyNote, Timer, Zap } from 'lucide-react';
import { TASK_PRIORITY_LABEL, nextStepOf, type PersonalTask, type PersonalTaskInput, type TaskStep } from '@/types/task';
import StepList from './StepList';
import { DueChip } from './TaskQueue';
import { PRIORITY_STYLE } from './taskStyle';
import XpBadge from './XpBadge';
import { PLAIN_SKIN, type TaskSkin } from './taskSkins';

/**
 * Focus mode: My tasks shrinks to one task. Everything else on the page — the
 * board, the queue, the filters, the tags — is gone until the person leaves,
 * so the only things on screen are this task, its steps and the button for
 * the next one.
 *
 * Which task is in focus is remembered per browser (the page keeps it), so a
 * reload lands back here rather than on the board. The timer is the
 * browser's own and is never saved: it is there to be looked at, not to
 * report on anybody — the list is a notepad, see src/types/task.ts.
 */
export default function TaskFocus({
  task,
  number,
  today,
  playing,
  skin = PLAIN_SKIN,
  upNext,
  onUpdate,
  onAdvance,
  onEdit,
  onExit,
  onFocus,
}: {
  task: PersonalTask;
  /** Its place in the queue; null once it is done. */
  number: number | null;
  today: string;
  playing: boolean;
  skin?: TaskSkin;
  /** What comes after this one, offered once it is finished. */
  upNext: PersonalTask | null;
  onUpdate: (input: PersonalTaskInput) => void;
  onAdvance: (task: PersonalTask) => void;
  onEdit: () => void;
  onExit: () => void;
  onFocus: (task: PersonalTask) => void;
}) {
  const [started, setStarted] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const finished = task.status === 'done';

  // A new task in focus starts the clock again.
  useEffect(() => { setStarted(Date.now()); setNow(Date.now()); }, [task.id]);
  useEffect(() => {
    if (finished) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [finished]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Only when nothing else on the page wants Escape — the editor closes itself first.
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  const secs = Math.max(0, Math.floor((now - started) / 1000));
  const clock = `${Math.floor(secs / 3600) > 0 ? `${Math.floor(secs / 3600)}:` : ''}${
    String(Math.floor((secs % 3600) / 60)).padStart(Math.floor(secs / 3600) > 0 ? 2 : 1, '0')}:${String(secs % 60).padStart(2, '0')}`;

  const step = nextStepOf(task);
  const lastStep = !!step && task.steps.filter((s) => !s.done).length === 1;
  const accent = skin.themed ? skin.accent : undefined;
  const saveSteps = (steps: TaskStep[]) => onUpdate({ steps });

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft size={15} /> Leave focus
        </button>
        <span
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-brand-700"
          style={accent ? { color: 'var(--tt-accent-ink)' } : undefined}
        >
          <Crosshair size={13} /> Focus mode
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-sm tabular-nums text-gray-500" title="Time in focus on this task. Not saved anywhere.">
          <Timer size={14} /> {clock}
        </span>
      </div>

      <section
        className={`rounded-2xl border-2 bg-white px-6 py-6 shadow-sm ${accent ? '' : 'border-brand-500'}`}
        style={accent ? { borderColor: accent } : undefined}
      >
        <div className="flex items-start gap-3">
          {number !== null && (
            <span className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg text-sm font-bold ${skin.button}`}>
              #{number}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className={`text-2xl font-bold leading-tight text-gray-900 ${skin.heading} ${finished ? 'line-through opacity-60' : ''}`}>
              {task.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {task.date && !finished && <DueChip date={task.date} time={task.time} today={today} />}
              {task.priority !== 'normal' && (
                <span className={`rounded px-1.5 py-0.5 text-[11px] ${PRIORITY_STYLE[task.priority]}`}>
                  {TASK_PRIORITY_LABEL[task.priority]} priority
                </span>
              )}
              {playing && <XpBadge task={task} today={today} />}
            </div>
          </div>
          <button type="button" onClick={onEdit} aria-label="Edit this task" className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <Pencil size={16} />
          </button>
        </div>

        {task.notes && (
          <p className="mt-4 whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <StickyNote size={12} className="mr-1 inline text-gray-400" />{task.notes}
          </p>
        )}

        {finished ? (
          <div className="mt-6 rounded-xl bg-green-50 px-4 py-5 text-center">
            <p className="text-lg font-semibold text-green-800">Finished. Nice work.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {upNext && (
                <button
                  type="button"
                  onClick={() => onFocus(upNext)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium ${skin.button}`}
                >
                  <Zap size={14} /> Focus on the next one: {upNext.title.length > 40 ? `${upNext.title.slice(0, 40)}…` : upNext.title}
                </button>
              )}
              <button
                type="button"
                onClick={() => onUpdate({ status: 'todo' })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <RotateCcw size={14} /> Reopen
              </button>
              <button
                type="button"
                onClick={onExit}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Back to my tasks
              </button>
            </div>
          </div>
        ) : (
          <>
            {step && (
              <div className="mt-6 rounded-xl bg-gray-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Your next {skin.step}</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{step.title}</p>
              </div>
            )}
            <button
              type="button"
              onClick={() => onAdvance(task)}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3.5 text-base font-semibold text-white hover:bg-green-700"
            >
              <Check size={18} strokeWidth={3} />
              {!step ? 'Done — finish this task' : lastStep ? `Done — that finishes the task` : `Done — on to the next ${skin.step}`}
            </button>
          </>
        )}

        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold capitalize text-gray-900">{skin.steps}</h2>
          <StepList steps={task.steps} onChange={saveSteps} one={skin.step} many={skin.steps} large />
          {!finished && step === null && task.steps.length === 0 && (
            <p className="mt-2 text-xs text-gray-500">
              Big task? Break it into {skin.steps} and the Done button walks you through them one at a time.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
