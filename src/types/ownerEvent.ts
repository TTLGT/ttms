import type { Timestamp } from 'firebase/firestore';

/**
 * One entry in the ownership history of an order or a party.
 *
 * Every record keeps every owner it has ever had. Ownership decides who can
 * see a load and its rates, so "who owned this in March, and who moved it" has
 * to be answerable months later — from a commission dispute, or from someone
 * asking why a broker could read an order they should not have.
 *
 * Stored as a subcollection (`orders/{id}/ownerEvents`, `parties/{id}/ownerEvents`)
 * rather than an array on the parent for two reasons: an array would be
 * rewritable by anyone who can update the parent document, and a record
 * changing hands for years would grow the parent without bound.
 *
 * Written only through the Admin SDK. `firestore.rules` closes writes outright.
 */
export type OwnerEventAction = 'added' | 'removed' | 'changed';

/**
 * What the entry points at. `text` is the BATS name for an owner the import
 * could not match to anybody — a real historical owner of the record that
 * grants no access, kept so the timeline starts where the data did rather than
 * at the first manual edit.
 */
export type OwnerTargetType = 'user' | 'group' | 'email' | 'text';

export interface OwnerEvent {
  id: string;
  action: OwnerEventAction;
  targetType: OwnerTargetType;
  /** uid, work group id, email, or '' for a text owner. */
  targetId: string;
  /**
   * How to name the target in the timeline, captured at write time. Resolved
   * once rather than on read so a deleted work group or a departed user still
   * reads correctly years later instead of rendering as a dangling id.
   */
  targetLabel: string;
  /** uid of whoever made the change, or 'bats-import' for the opening entry. */
  actorUid: string;
  actorName: string;
  /** Null for the import, which has no request behind it. */
  actorIp: string | null;
  at: Timestamp;
}

export const OWNER_EVENTS_SUBCOLLECTION = 'ownerEvents';

/**
 * Fixed document id for the entry the BATS import writes.
 *
 * Deliberately not auto-generated: the importer is designed to be re-run with
 * a fresh export, and an auto-id would append another "imported as X" entry on
 * every pass. A fixed id makes the opening entry idempotent — re-importing
 * rewrites the same document instead of growing the history.
 */
export const IMPORT_ORIGIN_EVENT_ID = 'bats-origin';

export const OWNER_ACTION_LABEL: Record<OwnerEventAction, string> = {
  added:   'Added',
  removed: 'Removed',
  changed: 'Changed',
};
