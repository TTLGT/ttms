import {
  CalendarClock, CornerUpRight, MapPin, PartyPopper, Phone, Users, Video, XCircle, type LucideIcon,
} from 'lucide-react';
import {
  EXTRA_COLORS,
  type BaseColor, type BuiltInTaskStatus, type EventType, type ExtraColor, type TaskColor, type TaskOutcome,
  type TaskPriority, type TaskStatus,
} from '@/types/task';

/**
 * Sticky-note colours as plain Tailwind families. Every one of them is mapped
 * in tailwind.config.ts, so a yellow note goes dark in dark mode without a
 * `dark:` class anywhere.
 *
 * On a dark ground the 100 tint is too faint — a 22% wash of yellow over slate
 * reads as mud, and the colours were hard to tell apart — so under dark and
 * dim a note steps up to the 200 ground and the 300 edge. One of the few
 * `dark:` classes in the app, because the mapping alone cannot say "a
 * stronger tint here only". The light theme is unchanged.
 *
 * The swatch is a solid 400, which the mapping leaves alone, so the picker and
 * the dots on the calendar and table are the same clear colour in every theme.
 *
 * Written out in full, never assembled from the family name: Tailwind only
 * generates classes it can find spelled out in the source.
 */
const BASE_NOTE_STYLE: Record<BaseColor, { note: string; chip: string; swatch: string }> = {
  yellow: {
    note: 'bg-yellow-100 border-yellow-200 text-yellow-900 dark:bg-yellow-200 dark:border-yellow-300',
    chip: 'bg-yellow-100 text-yellow-800',
    swatch: 'bg-yellow-400',
  },
  pink: {
    note: 'bg-pink-100 border-pink-200 text-pink-900 dark:bg-pink-200 dark:border-pink-300',
    chip: 'bg-pink-100 text-pink-800',
    swatch: 'bg-pink-400',
  },
  blue: {
    note: 'bg-sky-100 border-sky-200 text-sky-900 dark:bg-sky-200 dark:border-sky-300',
    chip: 'bg-sky-100 text-sky-800',
    swatch: 'bg-sky-400',
  },
  green: {
    note: 'bg-green-100 border-green-200 text-green-900 dark:bg-green-200 dark:border-green-300',
    chip: 'bg-green-100 text-green-800',
    swatch: 'bg-green-400',
  },
  purple: {
    note: 'bg-violet-100 border-violet-200 text-violet-900 dark:bg-violet-200 dark:border-violet-300',
    chip: 'bg-violet-100 text-violet-800',
    swatch: 'bg-violet-400',
  },
  orange: {
    note: 'bg-orange-100 border-orange-200 text-orange-900 dark:bg-orange-200 dark:border-orange-300',
    chip: 'bg-orange-100 text-orange-800',
    swatch: 'bg-orange-400',
  },
};

/**
 * The extra colours are drawn by `.tt-tag-*` in globals.css from the hue
 * class (`tt-h90`), which works out each theme's shade — see EXTRA_COLORS.
 * Same three keys, so nothing that draws a task needs to know which kind it has.
 */
export const NOTE_STYLE: Record<TaskColor, { note: string; chip: string; swatch: string }> = {
  ...BASE_NOTE_STYLE,
  ...Object.fromEntries(EXTRA_COLORS.map((c) => [c, {
    note: `tt-tag-note tt-${c}`,
    chip: `tt-tag-chip tt-${c}`,
    swatch: `tt-tag-swatch tt-${c}`,
  }])) as Record<ExtraColor, { note: string; chip: string; swatch: string }>,
};

const BUILT_IN_DOT: Record<BuiltInTaskStatus, string> = {
  todo:    'border-gray-400',
  ready:   'border-sky-500',
  doing:   'border-amber-500',
  waiting: 'border-violet-500',
  review:  'border-pink-500',
  done:    'border-green-500 bg-green-500',
};

/** A column somebody added has no colour of its own; a dashed ring says "yours". */
export function statusDot(status: TaskStatus): string {
  return BUILT_IN_DOT[status as BuiltInTaskStatus] ?? 'border-dashed border-gray-500';
}

export const PRIORITY_STYLE: Record<TaskPriority, string> = {
  low:    'bg-gray-100 text-gray-600',
  normal: 'bg-blue-50 text-blue-700',
  high:   'bg-red-50 text-red-700',
};

/** Drag payload type, so a task dragged from here is never confused with a file dropped from the desktop. */
export const TASK_DRAG_TYPE = 'application/x-ttms-task';
/**
 * Rides along with TASK_DRAG_TYPE: the date the dragged chip was drawn on.
 * The same for a single item; for a repeating event it says which date of the
 * series was picked up, which the item's own `date` (the first one) cannot.
 */
export const OCCURRENCE_DRAG_TYPE = 'application/x-ttms-occurrence';

/** A board column being dragged into a new place — kept apart from a card so neither drop takes the other. */
export const COLUMN_DRAG_TYPE = 'application/x-ttms-column';

/** One icon per sort of event, used everywhere an event is drawn. */
export const EVENT_ICON: Record<EventType, LucideIcon> = {
  call:        Phone,
  online:      Video,
  meeting:     Users,
  activity:    PartyPopper,
  appointment: MapPin,
  other:       CalendarClock,
};

/**
 * How a closed task is drawn, by its outcome (see TASK_OUTCOMES): Done is
 * struck through, as it always was; Not done keeps its words readable with a
 * red edge, because it is the one worth noticing when looking back at a day;
 * Rescheduled is faded and slanted, since it lives on elsewhere.
 */
export const OUTCOME_STYLE: Record<TaskOutcome, string> = {
  done: 'line-through opacity-60',
  notdone: 'opacity-75 ring-1 ring-red-400',
  rescheduled: 'italic opacity-55',
};

export const OUTCOME_ICON: Record<Exclude<TaskOutcome, 'done'>, LucideIcon> = {
  notdone: XCircle,
  rescheduled: CornerUpRight,
};
