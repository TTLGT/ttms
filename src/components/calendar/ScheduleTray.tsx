'use client';

import { useState } from 'react';
import { Flag, GripVertical } from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { OCCURRENCE_DRAG_TYPE, TASK_DRAG_TYPE } from '@/components/tasks/taskStyle';
import { Bi } from '@/components/spanish/Es';
import { taskQueue, type PersonalTask } from '@/types/task';

/**
 * The Planner Calendar's tray (step 6, 2026-11-25): every open task that has
 * no time yet, in the person's own order, ready to be dragged onto the
 * calendar — onto a day in Month view, or onto an hour in Week, 4 days or Day.
 *
 * It replaces making a work block through a form for the common case: "when
 * will I do this?" is answered by putting the task itself on the calendar,
 * which gives it a date and a time — the same fields the editor's When sets.
 * Work blocks still exist, from the editor, for a task that needs several
 * sittings.
 *
 * Nothing here moves anything itself. It only hands the calendar a drag in
 * the format its own chips use (TASK_DRAG_TYPE with the task's id), so the
 * drop goes through the calendar's own handlers — including the question a
 * repeating task asks.
 */

const SHOWN = 12;

export default function ScheduleTray({ tasks, today, onOpen }: {
  tasks: PersonalTask[];
  today: string;
  onOpen: (task: PersonalTask) => void;
}) {
  const { formatCalendarDate } = useDateFormatters();
  const [all, setAll] = useState(false);
  const waiting = taskQueue(tasks).filter((t) => !t.time && !t.archived && !t.fromHistory);
  const shown = all ? waiting : waiting.slice(0, SHOWN);

  return (
    <section data-tour="cal-tray" className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <span data-es className="flex-1">To schedule</span>
        <span className="text-xs font-normal text-gray-500">{waiting.length}</span>
      </h3>
      <p className="mt-0.5 text-xs text-gray-500">
        <Bi>Tasks with no time yet. Drag one onto a day, or onto an hour in Week view.</Bi>
      </p>
      {waiting.length === 0 ? (
        <p className="mt-3 text-xs text-gray-400"><Bi>Everything open has a time.</Bi></p>
      ) : (
        <ul className="mt-3 space-y-1">
          {shown.map((t) => (
            <li key={t.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData(TASK_DRAG_TYPE, t.id);
                // Where it was picked up from: its own day, or none.
                if (t.date) e.dataTransfer.setData(OCCURRENCE_DRAG_TYPE, t.date);
                e.dataTransfer.setData('text/plain', t.title);
              }}
              className="group flex cursor-grab items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm hover:border-brand-300 active:cursor-grabbing">
              <GripVertical size={13} className="flex-shrink-0 text-gray-300 group-hover:text-gray-500" aria-hidden />
              {t.priority === 'high' && <Flag size={11} className="flex-shrink-0 text-red-600" aria-label="Urgent" />}
              <button type="button" onClick={() => onOpen(t)} className="min-w-0 flex-1 truncate text-left text-gray-800 hover:underline">
                {t.title}
              </button>
              <span className="flex-shrink-0 text-[11px] text-gray-500">
                {t.date ? (t.date === today ? 'Today' : formatCalendarDate(t.date)) : <span data-es>No day</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {waiting.length > SHOWN && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-xs font-medium text-brand-700 hover:underline">
          {all ? 'Show fewer' : `Show all ${waiting.length}`}
        </button>
      )}
    </section>
  );
}
