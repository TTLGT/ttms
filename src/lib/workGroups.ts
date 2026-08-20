import { auth } from './firebase';
import type { WorkGroup } from '@/types/workGroup';

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

export async function listWorkGroups(): Promise<WorkGroup[]> {
  const res = await fetch('/api/work-groups', { headers: await authHeaders() });
  const { groups } = await unwrap<{ groups: WorkGroup[] }>(res);
  return groups;
}

export async function createWorkGroup(name: string, memberUids: string[], notes = '') {
  const res = await fetch('/api/work-groups', {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify({ name, memberUids, notes }),
  });
  return unwrap<{ id: string }>(res);
}

export async function updateWorkGroup(
  groupId: string,
  patch: { name?: string; memberUids?: string[]; notes?: string },
) {
  const res = await fetch(`/api/work-groups/${groupId}`, {
    method:  'PATCH',
    headers: await authHeaders(),
    body:    JSON.stringify(patch),
  });
  return unwrap<{ id: string }>(res);
}

export async function deleteWorkGroup(groupId: string) {
  const res = await fetch(`/api/work-groups/${groupId}`, {
    method:  'DELETE',
    headers: await authHeaders(),
  });
  return unwrap<{ deleted: string; detachedParties: number }>(res);
}
