/**
 * Turning a BATS owner name into real ownership.
 *
 * BATS records the owning rep as a display name ("Nery Mendez", "Gabe/Axel")
 * or a team-ish label ("TTL Gabe's Team"), never as an account. This module is
 * what converts those strings into things the access rules actually understand:
 * user ids, work group ids, or — for someone who exists but has never signed
 * in — an email to hold the assignment under until they do.
 *
 * Two rules govern everything here:
 *
 *   1. Existing is the test, not having signed in. A rep invited last week who
 *      has never logged in is a real person and gets a real assignment; the
 *      only difference is that it is held by email until first sign-in mints a
 *      uid. Matching therefore runs against `allowedUsers`, which holds
 *      everyone, and NOT against `users`, which holds only people who have
 *      authenticated at least once.
 *
 *   2. Ambiguity is never guessed. Two people matching one name leaves the
 *      record as plain text for an admin to settle. A wrong owner silently
 *      hands one broker another broker's book of business, which is far worse
 *      than an unassigned record someone has to look at.
 *
 * Work groups own records; teams do not. Teams are the org chart (see
 * src/types/team.ts) and are deliberately absent from the lookup below — a
 * name that matches only a team resolves to nothing.
 *
 * ⚠️  Mirrored into scripts/import-bats.js and scripts/resolve-party-owners.js,
 * which are plain node and cannot import TypeScript. Change all three.
 */

import { adminDb } from './firebase-admin';
import {
  ALLOWED_USERS_COLLECTION,
  USERS_COLLECTION,
  WORK_GROUPS_COLLECTION,
  normalizeEmail,
} from './accessControl';

/**
 * Compare on letters and digits alone. BATS names arrive with inconsistent
 * casing, punctuation and spacing ("O'Brien", "OBrien", "o brien"), and none of
 * that variation means anything.
 */
export function normalizeOwnerName(value: string | null | undefined): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

interface DirectoryPerson {
  email: string;
  /** null until the person has signed in at least once. */
  uid: string | null;
}

export interface OwnerDirectory {
  /** normalized work group name -> group id */
  groups: Map<string, string>;
  /** normalized person label -> everyone answering to it */
  people: Map<string, DirectoryPerson[]>;
  /** normalized BATS name -> 'group:<name>' or an email, from an admin override */
  overrides: Map<string, string>;
  /** email -> person, for resolving an override that names an address */
  byEmail: Map<string, DirectoryPerson>;
}

export interface ResolvedOwner {
  uids: string[];
  groupIds: string[];
  emails: string[];
  /** Nothing matched, or the match was ambiguous — keep the raw text. */
  unresolved: boolean;
  /** Distinguishes "two candidates" from "no candidates" in the import report. */
  ambiguous: boolean;
}

const NOTHING: ResolvedOwner = {
  uids: [], groupIds: [], emails: [], unresolved: true, ambiguous: false,
};

function addLabel(map: Map<string, DirectoryPerson[]>, label: string, person: DirectoryPerson) {
  const key = normalizeOwnerName(label);
  if (!key) return;
  const list = map.get(key) ?? [];
  // Someone can reach the same key by several labels (first+last and
  // displayName are usually identical); they must still count as one candidate
  // or every such person would look ambiguous against themselves.
  if (!list.some((p) => p.email === person.email)) list.push(person);
  map.set(key, list);
}

/**
 * Reads the directory once per import run rather than per row. A BATS file is
 * tens of thousands of rows against a few dozen people; querying per row would
 * dominate both the import time and the read bill.
 */
export async function loadOwnerDirectory(
  overrides: Map<string, string> = new Map(),
): Promise<OwnerDirectory> {
  const [groupSnap, allowSnap, userSnap] = await Promise.all([
    adminDb.collection(WORK_GROUPS_COLLECTION).get(),
    adminDb.collection(ALLOWED_USERS_COLLECTION).get(),
    adminDb.collection(USERS_COLLECTION).get(),
  ]);

  const groups = new Map<string, string>();
  for (const doc of groupSnap.docs) {
    const key = normalizeOwnerName(doc.data().name);
    if (key) groups.set(key, doc.id);
  }

  const byEmail = new Map<string, DirectoryPerson>();
  const people  = new Map<string, DirectoryPerson[]>();

  // The allowlist is the roster: everyone who exists is here, signed in or not.
  for (const doc of allowSnap.docs) {
    const d = doc.data();
    const email = normalizeEmail(d.email ?? doc.id);
    if (!email) continue;
    const person: DirectoryPerson = { email, uid: (d.uid as string) ?? null };
    byEmail.set(email, person);
    addLabel(people, [d.firstName, d.lastName].filter(Boolean).join(' '), person);
    addLabel(people, d.displayName ?? '', person);
    addLabel(people, email.split('@')[0], person);
  }

  // Profiles add the name Google reported for anyone whose allowlist entry
  // carries no name of its own, and are authoritative for the uid.
  for (const doc of userSnap.docs) {
    const d = doc.data();
    const email = normalizeEmail(d.email);
    if (!email) continue;
    let person = byEmail.get(email);
    if (!person) {
      // A bootstrap admin can hold a profile without an allowlist entry.
      person = { email, uid: doc.id };
      byEmail.set(email, person);
      addLabel(people, email.split('@')[0], person);
    }
    person.uid = doc.id;
    addLabel(people, d.displayName ?? '', person);
  }

  return { groups, people, overrides, byEmail };
}

function forPerson(person: DirectoryPerson): ResolvedOwner {
  return person.uid
    ? { uids: [person.uid], groupIds: [], emails: [], unresolved: false, ambiguous: false }
    : { uids: [], groupIds: [], emails: [person.email], unresolved: false, ambiguous: false };
}

/** Resolves one name segment — no splitting, no overrides. */
function resolveSegment(dir: OwnerDirectory, name: string): ResolvedOwner {
  const key = normalizeOwnerName(name);
  if (!key) return NOTHING;

  const groupId = dir.groups.get(key);
  if (groupId) {
    return { uids: [], groupIds: [groupId], emails: [], unresolved: false, ambiguous: false };
  }

  const hits = dir.people.get(key) ?? [];
  if (hits.length === 1) return forPerson(hits[0]);
  if (hits.length > 1) return { ...NOTHING, ambiguous: true };
  return NOTHING;
}

/**
 * Resolve a BATS owner string to the accounts and groups it names.
 *
 * "Gabe/Axel" and "Manny / Mary" are two owners rather than one unmatchable
 * name — a record can have several — so the string is split on `/` and every
 * part must resolve. A partial match is treated as no match: assigning half the
 * owners would quietly drop the other half, and a record left as text is
 * visibly unfinished where a half-assigned one is not.
 */
export function resolveOwner(dir: OwnerDirectory, rawName: string): ResolvedOwner {
  const name = (rawName ?? '').trim();
  if (!name) return NOTHING;

  // An admin override wins over everything, including an ambiguous name — it
  // exists precisely to settle the cases matching cannot.
  const override = dir.overrides.get(normalizeOwnerName(name));
  if (override) {
    if (override.toLowerCase().startsWith('group:')) {
      const groupId = dir.groups.get(normalizeOwnerName(override.slice(6)));
      return groupId
        ? { uids: [], groupIds: [groupId], emails: [], unresolved: false, ambiguous: false }
        : NOTHING;
    }
    const person = dir.byEmail.get(normalizeEmail(override));
    return person ? forPerson(person) : NOTHING;
  }

  const parts = name.split('/').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return NOTHING;

  const uids: string[] = [], groupIds: string[] = [], emails: string[] = [];
  let ambiguous = false;

  for (const part of parts) {
    const hit = resolveSegment(dir, part);
    if (hit.unresolved) return { ...NOTHING, ambiguous: hit.ambiguous };
    uids.push(...hit.uids);
    groupIds.push(...hit.groupIds);
    emails.push(...hit.emails);
    ambiguous = ambiguous || hit.ambiguous;
  }

  return {
    uids:     [...new Set(uids)],
    groupIds: [...new Set(groupIds)],
    emails:   [...new Set(emails)],
    unresolved: false,
    ambiguous,
  };
}

/** True when the resolution actually names somebody. */
export function hasOwner(r: ResolvedOwner): boolean {
  return r.uids.length > 0 || r.groupIds.length > 0 || r.emails.length > 0;
}
