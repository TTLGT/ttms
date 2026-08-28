import { auth } from './firebase';
import type { Team } from '@/types/team';

/**
 * Client helpers for teams. Reads and writes both go through the API rather
 * than Firestore directly, because deleting a team has to detach every user
 * assigned to it — work the client is not allowed to do.
 *
 * Deliberately a copy of the shape in `sites.ts` rather than a shared
 * abstraction over both: they are two different things that happen to be
 * administered the same way today, and folding them together would make it
 * harder to give a team the members-and-lead behaviour a site will never have.
 */

async function authHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${await user.getIdToken()}`,
  };
}

async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export async function listTeams(): Promise<Team[]> {
  const res = await fetch('/api/teams', { headers: await authHeaders() });
  const { teams } = await unwrap<{ teams: Team[] }>(res);
  return teams;
}

/**
 * `lead` is the lead's **email**, not their uid: it is the one identifier
 * everybody on the allowlist has, so a team can be pointed at someone who has
 * not signed in yet. The API decides whether that lands in `leadUid` or waits
 * in `leadEmail` — see `resolveLead` in `src/lib/teamLead.ts`.
 */
export async function createTeam(name: string, lead: string | null = null) {
  const res = await fetch('/api/teams', {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify({ name, lead }),
  });
  return unwrap<{ id: string }>(res);
}

export async function updateTeam(teamId: string, patch: { name?: string; lead?: string | null }) {
  const res = await fetch(`/api/teams/${teamId}`, {
    method:  'PATCH',
    headers: await authHeaders(),
    body:    JSON.stringify(patch),
  });
  return unwrap<{ id: string }>(res);
}

export async function deleteTeam(teamId: string) {
  const res = await fetch(`/api/teams/${teamId}`, {
    method:  'DELETE',
    headers: await authHeaders(),
  });
  return unwrap<{ deleted: string; detachedUsers: number }>(res);
}
