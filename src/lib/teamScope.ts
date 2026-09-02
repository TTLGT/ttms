import { adminDb } from './firebase-admin';
import {
  ALLOWED_USERS_COLLECTION,
  TEAMS_COLLECTION,
  USERS_COLLECTION,
  normalizeEmail,
} from './accessControl';

/**
 * Turns the org chart into something the security rules can test.
 *
 * A Sales Manager's reach is "everyone on the teams I lead". That is a query —
 * find the teams whose lead is me, then find the people whose `teamId` is one
 * of those — and rules cannot run queries. So the answer is computed here and
 * mirrored onto the manager's own profile as `managedUids` / `managedEmails`,
 * exactly as work-group membership is mirrored onto `groupIds` and a client's
 * owners are mirrored onto its orders, and for exactly the same reason.
 *
 * ## Why this recomputes everybody
 *
 * Any of these changes a manager's scope: a team gaining or losing a lead, a
 * team being deleted, somebody's `teamId` changing, somebody being made or
 * unmade a Sales Manager, a new hire signing in for the first time (their
 * email turns into a uid), somebody being removed from the company.
 *
 * Wiring each of those to a targeted recompute means six call sites that must
 * each work out which manager was affected, and one missed case leaves a
 * manager quietly seeing a former report's loads — the kind of bug nothing
 * fails loudly about. Both collections involved are tiny (a handful of teams,
 * a few dozen people), so this reads them whole and recomputes every manager
 * instead. Two collection reads is a cheap price for not having to be clever.
 *
 * It writes only where the answer actually changed, so the common case — a
 * change that affects nobody's scope — costs nothing beyond the two reads.
 */

export interface ManagedScope {
  uids: string[];
  emails: string[];
}

const EMPTY: ManagedScope = { uids: [], emails: [] };

/**
 * Recompute and re-mirror every Sales Manager's scope.
 *
 * Call after anything that could move a person between teams, change who leads
 * one, or change who is a Sales Manager. Safe to call when nothing changed.
 *
 * Returns how many profiles were rewritten, which is what the callers log.
 */
export async function syncManagedScopes(): Promise<number> {
  const [teamsSnap, peopleSnap] = await Promise.all([
    adminDb.collection(TEAMS_COLLECTION).get(),
    adminDb.collection(ALLOWED_USERS_COLLECTION).get(),
  ]);

  const people = peopleSnap.docs.map((d) => {
    const data = d.data();
    return {
      email:          normalizeEmail(data.email ?? d.id),
      uid:            typeof data.uid === 'string' && data.uid ? data.uid : null,
      teamId:         typeof data.teamId === 'string' ? data.teamId : null,
      isSalesManager: data.isSalesManager === true,
      // Suspension is deliberately not consulted. A suspended person keeps
      // their entry, their roles and their team so everything can be put back
      // when they return, and their manager is exactly who needs to see the
      // loads they left behind in the meantime.
    };
  });

  /** Which teams each person leads, by the two ways a lead can be recorded. */
  const teamsLedBy = new Map<string, string[]>();
  for (const doc of teamsSnap.docs) {
    const data     = doc.data();
    const leadUid  = typeof data.leadUid === 'string' ? data.leadUid : null;
    const leadMail = normalizeEmail(data.leadEmail);

    // A lead is held by uid once they have signed in and by email until then —
    // see the field comments on Team. Resolving both to the person's email
    // here means the rest of this function has one kind of key to think about.
    const lead = leadUid
      ? people.find((p) => p.uid === leadUid)
      : leadMail
        ? people.find((p) => p.email === leadMail)
        : undefined;
    if (!lead) continue;

    teamsLedBy.set(lead.email, [...(teamsLedBy.get(lead.email) ?? []), doc.id]);
  }

  let written = 0;

  await Promise.all(
    people.map(async (person) => {
      // Everybody gets a value written, not only the managers. A person who
      // has just been demoted, or whose team was handed to somebody else, must
      // have their mirror cleared — leaving the old array in place would leave
      // them seeing a team that is no longer theirs, and that stale array is
      // the exact failure this whole mechanism exists to avoid.
      const scope = person.isSalesManager
        ? scopeFor(person, teamsLedBy.get(person.email) ?? [], people)
        : EMPTY;

      if (!person.uid) return; // Nothing to mirror onto until they sign in.

      const ref  = adminDb.collection(USERS_COLLECTION).doc(person.uid);
      const snap = await ref.get();
      if (!snap.exists) return;

      const current = snap.data() ?? {};
      if (
        same(current.managedUids, scope.uids)
        && same(current.managedEmails, scope.emails)
      ) return;

      await ref.set(
        { managedUids: scope.uids, managedEmails: scope.emails },
        { merge: true },
      );
      written += 1;
    }),
  );

  return written;
}

/**
 * The people on the teams this manager leads.
 *
 * The manager themselves is left out. Their own records are already theirs by
 * ownership, and putting their uid in the list would make every test for "does
 * this belong to somebody I manage" also answer yes for their own work —
 * harmless today, but it would make the audit trail read as if a manager had
 * reached into their own book through their team.
 */
function scopeFor(
  manager: { email: string; uid: string | null },
  teamIds: string[],
  people: { email: string; uid: string | null; teamId: string | null }[],
): ManagedScope {
  if (teamIds.length === 0) return EMPTY;

  const members = people.filter(
    (p) => p.teamId && teamIds.includes(p.teamId) && p.email !== manager.email,
  );

  return {
    uids: members.map((p) => p.uid).filter((uid): uid is string => !!uid).sort(),
    // Only the ones with no uid yet. A member who has signed in is matched by
    // uid, and carrying their address as well would mean two ways to match one
    // person and two places to get it wrong.
    emails: members.filter((p) => !p.uid).map((p) => p.email).sort(),
  };
}

/**
 * Splits a managed list into query-sized pieces.
 *
 * Firestore's `array-contains-any` takes at most 30 values, and a team can be
 * bigger than that. Every server-side query that widens a manager's view runs
 * once per chunk and merges the results, which is why this is here rather than
 * inlined at each of those call sites.
 */
export function inChunks<T>(items: T[], size = 30): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Array equality, order-insensitive — both sides are written sorted. */
function same(current: unknown, next: string[]): boolean {
  if (!Array.isArray(current)) return next.length === 0;
  if (current.length !== next.length) return false;
  return current.every((value, i) => value === next[i]);
}

/**
 * The scope for one person, computed on demand rather than read from the
 * mirror.
 *
 * Used at sign-in, where the profile is being written from scratch and the
 * mirror it would otherwise be read from may not exist yet. Everything else
 * should read `managedUids` off the profile — that is the whole point of it.
 */
export async function managedScopeFor(email: string): Promise<ManagedScope> {
  const normalized = normalizeEmail(email);
  if (!normalized) return EMPTY;

  // The one entry first, on its own. This runs on every sign-in, and almost
  // nobody is a Sales Manager — reading two whole collections to discover that
  // would be two collection reads per login for an answer that is nearly
  // always "none".
  const entrySnap = await adminDb.collection(ALLOWED_USERS_COLLECTION).doc(normalized).get();
  if (entrySnap.data()?.isSalesManager !== true) return EMPTY;

  const uid = typeof entrySnap.data()?.uid === 'string' ? entrySnap.data()!.uid : null;

  const [teamsSnap, peopleSnap] = await Promise.all([
    adminDb.collection(TEAMS_COLLECTION).get(),
    adminDb.collection(ALLOWED_USERS_COLLECTION).get(),
  ]);

  const teamIds = teamsSnap.docs
    .filter((doc) => {
      const data = doc.data();
      return (uid && data.leadUid === uid)
        || normalizeEmail(data.leadEmail) === normalized;
    })
    .map((doc) => doc.id);

  const people = peopleSnap.docs.map((d) => {
    const data = d.data();
    return {
      email:  normalizeEmail(data.email ?? d.id),
      uid:    typeof data.uid === 'string' && data.uid ? data.uid : null,
      teamId: typeof data.teamId === 'string' ? data.teamId : null,
    };
  });

  return scopeFor({ email: normalized, uid }, teamIds, people);
}
