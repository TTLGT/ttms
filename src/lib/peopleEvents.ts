import { FieldValue, adminDb } from './firebase-admin';
import { PEOPLE_EVENTS_COLLECTION } from './accessControl';
import { ROLE_LABELS, ROLE_ORDER, type RoleKey } from '@/types/permission';
import type { PeopleEventAction, PeopleEventSource } from '@/types/peopleEvent';

/**
 * Writing the access history: one line each time somebody joins the system,
 * leaves it, or is put back.
 *
 * Server-only, and the only writer. `firestore.rules` denies the collection to
 * every client, so an entry can only come from a route that already proved the
 * caller may manage people.
 *
 * **Never throws.** This is deliberately the opposite of `archiveRemoval`,
 * which aborts a removal it cannot log. The archive is the record of who a
 * departed person was and what they could do, so losing one loses information
 * nothing else holds; this is a timeline assembled from events that each have
 * their own record elsewhere, and refusing to add somebody because the
 * timeline write failed would be a worse outcome than a gap in the timeline.
 * A failure is logged to the server console and swallowed.
 */

/** The roles a stored entry holds, as labels — empty means a plain broker. */
export function rolesHeld(entry: Record<string, unknown>): string[] {
  return ROLE_ORDER.filter((role: RoleKey) => entry[role] === true)
    .map((role) => ROLE_LABELS[role]);
}

/** The name on an allowlist entry or an archive row, or '' when never set. */
export function personName(entry: Record<string, unknown>): string {
  const first = typeof entry.firstName === 'string' ? entry.firstName : '';
  const last  = typeof entry.lastName  === 'string' ? entry.lastName  : '';
  const joined = [first, last].filter(Boolean).join(' ').trim();
  if (joined) return joined;
  return typeof entry.displayName === 'string' ? entry.displayName.trim() : '';
}

export async function recordPeopleEvent(event: {
  action: PeopleEventAction;
  email: string;
  name: string;
  roles: string[];
  actorEmail: string;
  actorUid: string;
  source: PeopleEventSource;
  /** The `removedUsers` row behind a removal or a restore; null for an add. */
  removalId?: string | null;
}): Promise<void> {
  try {
    await adminDb.collection(PEOPLE_EVENTS_COLLECTION).add({
      action:     event.action,
      email:      event.email,
      // Resolved by the caller at the moment it happened, not looked up on
      // read — after a removal there is no entry left to look anything up in.
      name:       event.name,
      roles:      event.roles,
      actorEmail: event.actorEmail,
      actorUid:   event.actorUid,
      source:     event.source,
      removalId:  event.removalId ?? null,
      at:         FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error('[peopleEvents] could not record', event.action, event.email, e);
  }
}
