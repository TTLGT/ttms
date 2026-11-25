'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { Flag } from 'lucide-react';
import { PRIORITY_STYLE } from './taskStyle';
import { TASK_PRIORITY_LABEL, type TaskPriority } from '@/types/task';

/*
 * The Planner draws priority as one Urgent flag (step 5, decided 2026-11-25):
 * Urgent is the stored High, and Low and Normal both read as ordinary. The
 * stored three levels are unchanged and the old My tasks page still shows
 * all three, so the views both pages share ask this context which to draw
 * rather than taking a prop through every layer of the board.
 *
 * Priority sets no XP — difficulty does (TASK_XP) — so nothing in game mode
 * depends on Low being visible.
 */

const UrgentOnlyContext = createContext(false);

export function UrgentOnlyProvider({ children }: { children: ReactNode }) {
  return <UrgentOnlyContext.Provider value>{children}</UrgentOnlyContext.Provider>;
}

/** True inside the Planner: draw Urgent or nothing. */
export function useUrgentOnly(): boolean {
  return useContext(UrgentOnlyContext);
}

/**
 * The priority badge on a card: "Urgent" with a flag in the Planner, the
 * level's own name on the old page. Nothing for Normal either way.
 */
export function PriorityTag({ priority, suffix = '' }: { priority: TaskPriority; suffix?: string }) {
  const urgentOnly = useUrgentOnly();
  if (urgentOnly) {
    if (priority !== 'high') return null;
    return (
      <span data-es="Urgent" className="inline-flex items-center gap-0.5 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
        <Flag size={10} /> Urgent
      </span>
    );
  }
  if (priority === 'normal') return null;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] ${PRIORITY_STYLE[priority]}`}>
      {TASK_PRIORITY_LABEL[priority]}{suffix}
    </span>
  );
}
