'use client';

import { useCallback, useEffect, useState } from 'react';
import { auth } from './firebase';
import {
  byOrder,
  orderBetween,
  type PersonalTask,
  type PersonalTaskInput,
} from '@/types/task';

/**
 * Browser side of the personal task list, which lives behind /api/me/tasks —
 * see src/types/task.ts for why it is not read direct.
 */

async function authedFetch<T>(input: string, init: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('You are not signed in.');

  const idToken = await user.getIdToken();
  const res = await fetch(input, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${idToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}

export async function listMyTasks(): Promise<PersonalTask[]> {
  const data = await authedFetch<{ tasks?: PersonalTask[] }>('/api/me/tasks');
  return data.tasks ?? [];
}

export async function createMyTask(input: PersonalTaskInput): Promise<PersonalTask> {
  const data = await authedFetch<{ task: PersonalTask }>('/api/me/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.task;
}

export async function updateMyTask(id: string, input: PersonalTaskInput): Promise<PersonalTask> {
  const data = await authedFetch<{ task: PersonalTask }>(`/api/me/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data.task;
}

export async function deleteMyTask(id: string): Promise<void> {
  await authedFetch(`/api/me/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function clearMyDoneTasks(): Promise<string[]> {
  const data = await authedFetch<{ deleted: string[] }>('/api/me/tasks?status=done', { method: 'DELETE' });
  return data.deleted;
}

export async function reorderMyTasks(ids: string[]): Promise<void> {
  await authedFetch('/api/me/tasks/reorder', { method: 'POST', body: JSON.stringify({ ids }) });
}

/**
 * The list, and every change to it, for one page.
 *
 * Changes are drawn first and saved second, so a card lands where it was
 * dropped the moment it is dropped. A save that fails puts the list back the
 * way the server has it and says why — a card that silently jumps back is
 * worse than one that says it could not move.
 */
export function usePersonalTasks() {
  const [tasks, setTasks] = useState<PersonalTask[] | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      setTasks(await listMyTasks());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your list');
      setTasks((t) => t ?? []);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const fail = useCallback((e: unknown, what: string) => {
    setError(e instanceof Error ? e.message : what);
    reload();
  }, [reload]);

  const replace = (task: PersonalTask) =>
    setTasks((list) => (list ?? []).map((t) => (t.id === task.id ? task : t)));

  const create = useCallback(async (input: PersonalTaskInput) => {
    setError('');
    try {
      const task = await createMyTask(input);
      setTasks((list) => [...(list ?? []), task]);
      return task;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that');
      return null;
    }
  }, []);

  const update = useCallback(async (id: string, input: PersonalTaskInput) => {
    setError('');
    setTasks((list) => (list ?? []).map((t) => (t.id === id ? { ...t, ...input } : t)));
    try {
      replace(await updateMyTask(id, input));
    } catch (e) {
      fail(e, 'Could not save that');
    }
  }, [fail]);

  const remove = useCallback(async (id: string) => {
    setError('');
    setTasks((list) => (list ?? []).filter((t) => t.id !== id));
    try {
      await deleteMyTask(id);
    } catch (e) {
      fail(e, 'Could not delete that');
    }
  }, [fail]);

  const clearDone = useCallback(async () => {
    setError('');
    try {
      const gone = new Set(await clearMyDoneTasks());
      setTasks((list) => (list ?? []).filter((t) => !gone.has(t.id)));
    } catch (e) {
      fail(e, 'Could not clear finished tasks');
    }
  }, [fail]);

  /**
   * Put `id` into `group` just before `beforeId` (or at the end when null).
   * `group` is the column it is dropped in, already sorted and without the
   * card being moved; `patch` carries the status change for a board drop.
   * One write normally, a renumbering of the group when the gap has closed.
   */
  const move = useCallback(async (
    id: string,
    group: PersonalTask[],
    beforeId: string | null,
    patch: PersonalTaskInput = {},
  ) => {
    const others = group.filter((t) => t.id !== id).sort(byOrder);
    const at = beforeId ? others.findIndex((t) => t.id === beforeId) : others.length;
    const index = at < 0 ? others.length : at;
    const before = index > 0 ? others[index - 1].order : null;
    const after  = index < others.length ? others[index].order : null;
    const order  = orderBetween(before, after);

    if (order !== null) {
      await update(id, { ...patch, order });
      return;
    }

    const ids = [...others.slice(0, index).map((t) => t.id), id, ...others.slice(index).map((t) => t.id)];
    setError('');
    setTasks((list) => (list ?? []).map((t) => {
      const i = ids.indexOf(t.id);
      if (i < 0) return t;
      return { ...t, ...(t.id === id ? patch : {}), order: (i + 1) * 1000 };
    }));
    try {
      if (Object.keys(patch).length) await updateMyTask(id, patch);
      await reorderMyTasks(ids);
    } catch (e) {
      fail(e, 'Could not move that');
    }
  }, [update, fail]);

  return { tasks, error, setError, reload, create, update, remove, clearDone, move };
}
