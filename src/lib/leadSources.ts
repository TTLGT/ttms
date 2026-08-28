import { auth } from './firebase';
import type { LeadSource } from '@/types/leadSource';

/**
 * Client helpers for lead sources.
 *
 * Reads and writes both go through the API. The collection is closed to the
 * client SDK outright — the list decides how revenue is attributed, so an
 * admin-only route is the only way in, the same as sites and teams.
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

export async function listLeadSources(): Promise<LeadSource[]> {
  const res = await fetch('/api/lead-sources', { headers: await authHeaders() });
  const { leadSources } = await unwrap<{ leadSources: LeadSource[] }>(res);
  return leadSources;
}

export async function createLeadSource(name: string) {
  const res = await fetch('/api/lead-sources', {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify({ name }),
  });
  return unwrap<{ id: string; name: string }>(res);
}

export async function updateLeadSource(sourceId: string, patch: { name?: string; isActive?: boolean }) {
  const res = await fetch(`/api/lead-sources/${sourceId}`, {
    method:  'PATCH',
    headers: await authHeaders(),
    body:    JSON.stringify(patch),
  });
  return unwrap<{ id: string }>(res);
}

export async function deleteLeadSource(sourceId: string) {
  const res = await fetch(`/api/lead-sources/${sourceId}`, {
    method:  'DELETE',
    headers: await authHeaders(),
  });
  return unwrap<{ deleted: string }>(res);
}

/**
 * The label to show for a record's source.
 *
 * Resolved from the list rather than read off the record, so an admin renaming
 * a source updates every screen at once. `fallback` is the raw text BATS
 * supplied: it is shown only when the import could not match the name to a
 * managed source, so a load still says where it came from instead of showing a
 * blank the broker cannot explain.
 */
export function leadSourceLabel(
  sources: LeadSource[],
  sourceId: string | null | undefined,
  fallback = '',
): string {
  const hit = sourceId ? sources.find((s) => s.id === sourceId) : undefined;
  if (hit) return hit.name;
  return fallback.trim() || '—';
}
