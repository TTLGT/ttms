/**
 * One entry in the access history: somebody added to the system, taken off it,
 * or put back.
 *
 * `removedUsers` answers "who was Ana, and who removed her" — it is the full
 * archive of one departure. This is the other question, the one the archive
 * cannot answer: *the order things happened in*. Somebody added in March,
 * removed in June, put back in July and removed again in September is four
 * events and two removal records, and only the events read as a story.
 *
 * Deliberately thin. It carries a name, the roles held at the time and who did
 * it, and nothing else — no birthday, no personal email, no phone. The archive
 * keeps those, behind the admin-only route that serves it. Keeping them here
 * as well would mean two collections to think about every time somebody asks
 * where a departed employee's details live.
 *
 * **Append-only and written only through the Admin SDK.** `firestore.rules`
 * denies the collection outright; `/api/admin/users/events` is the only way in
 * and guards on `people.manage`.
 *
 * **Kept forever**, on the same standing decision as the removal log: it is
 * the record of who had access to the company's freight, and that question
 * does not expire. Do not add a purge, a TTL or a delete path.
 */
export type PeopleEventAction = 'added' | 'removed' | 'restored';

/**
 * Where the change came from. Worth keeping apart: an address that arrived in
 * a spreadsheet of forty was not a decision somebody made about that person,
 * and when an add looks wrong, "it came in on an import" is usually the answer.
 */
export type PeopleEventSource = 'settings' | 'import' | 'restore';

export interface PeopleEvent {
  /** The Firestore document id. Not stored in the document itself. */
  id: string;
  action: PeopleEventAction;
  email: string;
  /**
   * Their name as of the moment, resolved at write time rather than on read.
   * The allowlist entry is gone after a removal, so a row that looked its name
   * up later would render as a bare address for exactly the people most likely
   * to be asked about.
   */
  name: string;
  /** The roles they held at that moment, as labels. Empty means plain broker. */
  roles: string[];
  /** The admin's email, or their uid when the token carried no address. */
  actorEmail: string;
  actorUid: string;
  source: PeopleEventSource;
  /**
   * The `removedUsers` row this event belongs to, for a removal or a restore.
   * Null on an add, which has no archive row. It is what lets the history and
   * the removal log be read as one thing.
   */
  removalId: string | null;
  /**
   * ISO 8601, not a Timestamp — same reasoning as RemovedUser. These rows only
   * ever arrive over JSON from /api/admin/users/events, and the route converts
   * them so nothing downstream has to know what a Firestore Timestamp is.
   */
  at: string | null;
}

/** How each action reads on screen, in the past tense a log wants. */
export const PEOPLE_EVENT_LABEL: Record<PeopleEventAction, string> = {
  added:    'Added',
  removed:  'Removed',
  restored: 'Restored',
};
