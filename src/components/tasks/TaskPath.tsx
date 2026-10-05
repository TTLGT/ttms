'use client';

import { Check, Crosshair, Flag, Zap } from 'lucide-react';
import { nextStepOf, type PersonalTask, type PersonalTaskInput } from '@/types/task';
import { DueChip } from './TaskQueue';
import { NOTE_STYLE } from './taskStyle';
import XpBadge from './XpBadge';
import { PLAIN_SKIN, type TaskSkin } from './taskSkins';
import { TaskContactsLine } from './TaskContacts';

/**
 * The path: the queue drawn as a road. Each open task is a floating card,
 * alternating either side of a centre line, joined to it at a numbered stop;
 * inside each card its steps are a small numbered line of their own, ending
 * in the finish. Two orders, both visible at once — which task comes first,
 * and within it which step — which is the whole point of the view.
 *
 * Same data and the same order as the queue (byQueue()), so the numbers here
 * are the numbers there. Ticking a step's dot saves straight away, as in
 * focus mode. On a phone the road runs down the left edge instead.
 */
export default function TaskPath({
  queue,
  shown,
  upNextId,
  today,
  playing,
  skin = PLAIN_SKIN,
  onOpen,
  onFocus,
  onUpdate,
}: {
  /** The whole open queue, in order: what the numbers go by. */
  queue: PersonalTask[];
  /** Which of them the filters let through. */
  shown: Set<string>;
  upNextId: string | null;
  today: string;
  playing: boolean;
  skin?: TaskSkin;
  onOpen: (task: PersonalTask) => void;
  onFocus: (task: PersonalTask) => void;
  onUpdate: (id: string, input: PersonalTaskInput) => void;
}) {
  const rows = queue.map((t, i) => ({ t, n: i + 1 })).filter(({ t }) => shown.has(t.id));
  const accent = skin.themed ? skin.accent : undefined;

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
        {queue.length === 0 ? 'Nothing on the path yet. Add a task to start one.' : 'Nothing on the path matches the filter.'}
      </p>
    );
  }

  return (
    <div className="relative mx-auto max-w-5xl pb-8 pt-2">
      {/* The road. A soft gradient so it fades in at the top and out at the end. */}
      <div
        aria-hidden
        className="absolute bottom-0 top-0 left-5 w-1 -translate-x-1/2 rounded-full bg-gradient-to-b from-transparent via-gray-200 to-transparent md:left-1/2"
      />

      <ol className="relative space-y-6 md:space-y-2">
        {rows.map(({ t, n }, i) => {
          const right = i % 2 === 1;
          const upNext = t.id === upNextId;
          return (
            <li key={t.id} className="relative flex md:min-h-[7rem]">
              {/* The stop on the road, with the queue number in it. */}
              <span
                className={`absolute left-5 top-5 z-10 grid h-10 w-10 -translate-x-1/2 place-items-center rounded-full text-sm font-bold shadow-lg md:left-1/2 ${skin.button}`}
                style={upNext && accent ? { boxShadow: `0 0 0 4px ${accent}55, 0 10px 25px rgba(0,0,0,.15)` } : undefined}
              >
                {upNext && (
                  <span
                    aria-hidden
                    className={`absolute inset-0 animate-ping rounded-full opacity-30 ${accent ? '' : 'bg-brand-500'}`}
                    style={accent ? { background: accent } : undefined}
                  />
                )}
                <span className="relative">{n}</span>
              </span>

              {/* The arm from the stop to the card. */}
              <span
                aria-hidden
                className={`absolute top-[2.4rem] hidden h-px w-14 bg-gray-300 md:block ${right ? 'left-1/2' : 'right-1/2'}`}
              />

              <div className={`w-full pl-14 md:w-1/2 md:pl-0 ${right ? 'md:ml-auto md:pl-14' : 'md:pr-14'}`}>
                <PathCard
                  task={t}
                  upNext={upNext}
                  today={today}
                  playing={playing}
                  skin={skin}
                  onOpen={() => onOpen(t)}
                  onFocus={() => onFocus(t)}
                  onUpdate={(input) => onUpdate(t.id, input)}
                />
              </div>
            </li>
          );
        })}
      </ol>

      <div className="relative mt-4 flex md:justify-center">
        <span className="ml-5 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-500 shadow-sm md:ml-0 md:translate-x-0">
          <Flag size={12} /> End of the {skin.queue.toLowerCase()}
        </span>
      </div>
    </div>
  );
}

function PathCard({
  task, upNext, today, playing, skin, onOpen, onFocus, onUpdate,
}: {
  task: PersonalTask;
  upNext: boolean;
  today: string;
  playing: boolean;
  skin: TaskSkin;
  onOpen: () => void;
  onFocus: () => void;
  onUpdate: (input: PersonalTaskInput) => void;
}) {
  const next = nextStepOf(task);
  const done = task.steps.filter((s) => s.done).length;
  const accent = skin.themed ? skin.accent : undefined;
  const pct = task.steps.length ? Math.round((done / task.steps.length) * 100) : 0;

  const tick = (id: string) =>
    onUpdate({ steps: task.steps.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) });

  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border bg-white/90 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.25)] backdrop-blur transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_40px_-14px_rgba(15,23,42,0.35)] ${
        upNext ? (accent ? 'border-transparent' : 'border-brand-500 ring-1 ring-brand-500') : 'border-gray-200'
      }`}
      style={upNext && accent ? { boxShadow: `0 0 0 2px ${accent}, 0 18px 40px -14px rgba(15,23,42,.35)` } : undefined}
    >
      {/* The task's colour tag as a band along the top. */}
      <div aria-hidden className={`h-1.5 ${NOTE_STYLE[task.color].swatch}`} />

      <div className="px-4 pb-4 pt-3">
        {/* Who it is with, on top: outside the title's button, which cannot hold the chips. */}
        <TaskContactsLine contacts={task.contacts} prefix="with" className="mb-1 text-xs text-gray-600" />
        <div className="flex items-start gap-2">
          <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
            {upNext && (
              <span
                className="mb-0.5 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700"
                style={accent ? { color: 'var(--tt-accent-ink)' } : undefined}
              >
                <Zap size={11} /> {skin.upNext}
              </span>
            )}
            <span className={`block text-[15px] font-semibold leading-snug text-gray-900 ${skin.heading}`}>{task.title}</span>
          </button>
          <button
            type="button"
            onClick={onFocus}
            aria-label="Focus on this task"
            title="Focus on this task"
            className="rounded-lg p-1.5 text-gray-400 opacity-60 transition hover:bg-gray-100 hover:text-gray-700 group-hover:opacity-100"
          >
            <Crosshair size={15} />
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {task.date && <DueChip date={task.date} time={task.time} today={today} />}
          {playing && <XpBadge task={task} today={today} theme={skin.id} />}
          {task.steps.length > 0 && (
            <span className="ml-auto text-[11px] font-medium text-gray-500">{done}/{task.steps.length} {skin.steps}</span>
          )}
        </div>

        {task.steps.length > 0 && (
          <>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
            </div>

            {/* The steps as their own little road: numbered dots joined by a line, in order. */}
            <ol className="relative mt-3">
              <span aria-hidden className="absolute bottom-3 left-[0.6875rem] top-3 w-px bg-gray-200" />
              {task.steps.map((s, i) => {
                const isNext = s.id === next?.id;
                return (
                  <li key={s.id} className="relative flex items-center gap-2.5 py-1">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={s.done}
                      aria-label={s.done ? `Untick ${s.title}` : `Tick ${s.title}`}
                      onClick={() => tick(s.id)}
                      className={`relative z-10 grid h-[1.375rem] w-[1.375rem] flex-shrink-0 place-items-center rounded-full text-[10px] font-bold transition ${
                        s.done
                          ? 'bg-green-500 text-white'
                          : isNext
                            ? `${skin.button} shadow-md`
                            : 'border border-gray-300 bg-white text-gray-400 hover:border-green-500 hover:text-green-600'
                      }`}
                    >
                      {s.done ? <Check size={12} strokeWidth={3} /> : i + 1}
                    </button>
                    <span className={`min-w-0 flex-1 truncate text-sm ${
                      s.done ? 'text-gray-400 line-through' : isNext ? 'font-semibold text-gray-900' : 'text-gray-600'
                    }`}>
                      {s.title}
                    </span>
                    {s.date && !s.done && <DueChip date={s.date} today={today} className="flex-shrink-0" />}
                    {isNext && (
                      <span className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                        Next
                      </span>
                    )}
                  </li>
                );
              })}
              {/* The end of the task's own road: finishing it. */}
              <li className="relative flex items-center gap-2.5 py-1">
                <span className={`relative z-10 grid h-[1.375rem] w-[1.375rem] flex-shrink-0 place-items-center rounded-full ${
                  next ? 'border border-dashed border-gray-300 bg-white text-gray-300' : 'bg-gray-900 text-white'
                }`}>
                  <Flag size={11} />
                </span>
                <button
                  type="button"
                  disabled={!!next}
                  onClick={() => onUpdate({ status: 'done' })}
                  className={`text-sm ${next ? 'text-gray-400' : 'font-semibold text-green-700 hover:underline'}`}
                >
                  {next ? 'Finish the task' : 'All done: finish the task'}
                </button>
              </li>
            </ol>
          </>
        )}

        {task.steps.length === 0 && (
          <button
            type="button"
            onClick={() => onUpdate({ status: 'done' })}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-green-500 hover:text-green-700"
          >
            <Check size={12} strokeWidth={3} /> Mark done
          </button>
        )}
      </div>
    </article>
  );
}
