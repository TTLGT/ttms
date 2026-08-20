import { auth } from './firebase';
import type { Site } from '@/types/site';

/**
 * Client helpers for sites. Reads and writes both go through the API rather
 * than Firestore directly, because deleting a site has to detach every user
 * assigned to it — work the client is not allowed to do.
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

export async function listSites(): Promise<Site[]> {
  const res = await fetch('/api/sites', { headers: await authHeaders() });
  const { sites } = await unwrap<{ sites: Site[] }>(res);
  return sites;
}

export async function createSite(name: string, address = '') {
  const res = await fetch('/api/sites', {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify({ name, address }),
  });
  return unwrap<{ id: string }>(res);
}

export async function updateSite(siteId: string, patch: { name?: string; address?: string }) {
  const res = await fetch(`/api/sites/${siteId}`, {
    method:  'PATCH',
    headers: await authHeaders(),
    body:    JSON.stringify(patch),
  });
  return unwrap<{ id: string }>(res);
}

export async function deleteSite(siteId: string) {
  const res = await fetch(`/api/sites/${siteId}`, {
    method:  'DELETE',
    headers: await authHeaders(),
  });
  return unwrap<{ deleted: string; detachedUsers: number }>(res);
}
