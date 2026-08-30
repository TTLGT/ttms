import { millis } from './chat';
import type { ChatMessage } from '@/types/conversation';

/**
 * The bits of date and time writing a thread needs.
 *
 * Here rather than inside a component because three views draw messages now —
 * the room, an open thread, and the popup's version of both — and a day
 * divider that said "Yesterday" in one and "08/29" in another would read as a
 * bug in whichever one you happened to look at second.
 */

/** The calendar day a message falls on, for grouping. '' before it stamps. */
export function dayOf(m: Pick<ChatMessage, 'createdAt'>): string {
  const ms = millis(m.createdAt);
  return ms ? new Date(ms).toDateString() : '';
}

/**
 * The separator between days. Today and yesterday are named rather than dated,
 * because working out that 08/28 was yesterday is a small tax on every read.
 * Everything older goes through the company date format like every other date
 * in TTMS.
 */
export function dayLabel(
  m: Pick<ChatMessage, 'createdAt'>,
  formatDate: (v: Date) => string,
): string {
  const ms = millis(m.createdAt);
  if (!ms) return 'Sending…';
  const day       = new Date(ms).toDateString();
  const today     = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (day === today)     return 'Today';
  if (day === yesterday) return 'Yesterday';
  return formatDate(new Date(ms));
}

/**
 * The time of day beside a name.
 *
 * Not run through dateFormat.ts: that setting decides how a *date* is written,
 * and has nothing to say about a clock. An unstamped message is one the server
 * has not acknowledged yet, which lasts a fraction of a second.
 */
export function clock(m: Pick<ChatMessage, 'createdAt'>): string {
  const ms = millis(m.createdAt);
  if (!ms) return 'Sending…';
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * When something happened, for a list rather than a thread.
 *
 * A list row has one line to spare, so today collapses to a clock, yesterday
 * to a word, and anything older to the company date format. dayLabel says the
 * same things but takes a message and never shows a time, because a day
 * divider that carried one would be claiming to divide the day at 2:14pm.
 */
export function whenLabel(ms: number, formatDate: (v: Date) => string): string {
  if (!ms) return '';
  const when      = new Date(ms);
  const day       = when.toDateString();
  const today     = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (day === today) {
    return when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  if (day === yesterday) return 'Yesterday';
  return formatDate(when);
}

/**
 * Whether two messages in a row should be drawn as one run — one name, one
 * avatar, one tail.
 *
 * Repeating both on every line turns a fast back-and-forth into a wall of
 * headshots. A reply carrying a quote always breaks the run, or the quote
 * appears to belong to whoever spoke last.
 */
export function groupsWithPrevious(
  m: ChatMessage,
  previous: ChatMessage | undefined,
): boolean {
  if (!previous) return false;
  if (dayOf(previous) !== dayOf(m)) return false;
  if (m.replyTo) return false;
  if (previous.senderUid !== m.senderUid) return false;
  return millis(m.createdAt) - millis(previous.createdAt) < 5 * 60 * 1000;
}
