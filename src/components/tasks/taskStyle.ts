import {
  CalendarClock, MapPin, PartyPopper, Phone, Users, Video, type LucideIcon,
} from 'lucide-react';
import type { BuiltInTaskStatus, EventType, TaskColor, TaskPriority, TaskStatus } from '@/types/task';

/**
 * Sticky-note colours as plain Tailwind families. Every one of them is mapped
 * in tailwind.config.ts, so a yellow note is a dim yellow in dark mode without
 * a `dark:` class anywhere.
 */
export const NOTE_STYLE: Record<TaskColor, { note: string; chip: string; swatch: string }> = {
  yellow: { note: 'bg-yellow-100 border-yellow-200 text-yellow-900', chip: 'bg-yellow-100 text-yellow-800', swatch: 'bg-yellow-300' },
  pink:   { note: 'bg-pink-100 border-pink-200 text-pink-900',       chip: 'bg-pink-100 text-pink-800',     swatch: 'bg-pink-300' },
  blue:   { note: 'bg-sky-100 border-sky-200 text-sky-900',          chip: 'bg-sky-100 text-sky-800',       swatch: 'bg-sky-300' },
  green:  { note: 'bg-green-100 border-green-200 text-green-900',    chip: 'bg-green-100 text-green-800',   swatch: 'bg-green-300' },
  purple: { note: 'bg-violet-100 border-violet-200 text-violet-900', chip: 'bg-violet-100 text-violet-800', swatch: 'bg-violet-300' },
  orange: { note: 'bg-orange-100 border-orange-200 text-orange-900', chip: 'bg-orange-100 text-orange-800', swatch: 'bg-orange-300' },
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
