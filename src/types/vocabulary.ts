/**
 * One person's Learn English history: `vocabulary/{uid}`.
 *
 * Which words they have looked up, how often, and which they have marked as
 * known. Known words stop being underlined, which is what keeps the mode
 * useful after the first week — a page where "load" is underlined forty times
 * is a page nobody leaves the mode on for.
 *
 * Read and written only through `/api/me/words`, keyed on the uid off the ID
 * token. There is no Firestore rule for this collection and there should not
 * be one: which words somebody did not know is theirs, and a rule would be a
 * second door to keep shut.
 */

export const VOCABULARY_COLLECTION = 'vocabulary';

export interface WordRecord {
  /** Times the card for this word has been opened. */
  count: number;
  /** ISO string on the wire; a Timestamp in Firestore. Null for a word only ever marked known. */
  lastAt: string | null;
  known: boolean;
}

/** What the browser sends: lookups since the last save, and any known/unknown changes. */
export interface WordActivity {
  lookups?: Record<string, number>;
  known?: Record<string, boolean>;
}

/**
 * The most lookups of one word a single save may add. The browser already
 * throttles a word to one lookup a minute; this is only a ceiling on what a
 * hand-made request could do to somebody's own counts.
 */
export const MAX_LOOKUPS_PER_SAVE = 20;
