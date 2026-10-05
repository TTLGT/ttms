'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from './firebase';
import {
  DEFAULT_BOARD_COLUMNS,
  DEFAULT_TASK_REMINDER_SETTINGS,
  byOrder,
  orderBetween,
  type BoardColumn,
  type ColorLabels,
  type PersonalTask,
  type PersonalTaskInput,
  type TaskReminderSettings,
} from '@/types/task';
import type { GameEvent, GameState, GameTheme } from '@/types/taskGame';
import { EMPTY_TASK_STREAK, type TaskStreak } from '@/types/taskStreak';

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

/** What a save can say back about game mode, on top of the task itself. */
interface GameReply {
  game?: GameState | null;
  events?: GameEvent[];
  /** The plain streak, when the save moved it. */
  streak?: TaskStreak | null;
}

export async function listMyTasks(): Promise<{
  tasks: PersonalTask[]; settings: TaskReminderSettings; columns: BoardColumn[]; colorLabels: ColorLabels;
} & GameReply> {
  const data = await authedFetch<{
    tasks?: PersonalTask[]; settings?: TaskReminderSettings; columns?: BoardColumn[]; colorLabels?: ColorLabels;
  } & GameReply>('/api/me/tasks');
  return {
    tasks: data.tasks ?? [],
    settings: data.settings ?? DEFAULT_TASK_REMINDER_SETTINGS,
    columns: data.columns ?? DEFAULT_BOARD_COLUMNS,
    colorLabels: data.colorLabels ?? {},
    game: data.game ?? null,
    events: data.events ?? [],
    streak: data.streak ?? EMPTY_TASK_STREAK,
  };
}

/** Save the board's columns. `moved` is how many tasks a hide or a delete stepped back. */
export async function saveMyBoardColumns(columns: BoardColumn[]): Promise<{ columns: BoardColumn[]; moved: number }> {
  return authedFetch('/api/me/tasks/columns', { method: 'PUT', body: JSON.stringify({ columns }) });
}

/** Save the names given to the colours. The whole map: a colour left out goes back to its own name. */
export async function saveMyColorLabels(colorLabels: ColorLabels): Promise<ColorLabels> {
  const data = await authedFetch<{ colorLabels: ColorLabels }>('/api/me/tasks/labels', {
    method: 'PUT',
    body: JSON.stringify({ colorLabels }),
  });
  return data.colorLabels;
}

export async function saveMyGameOptions(options: { enabled?: boolean; theme?: GameTheme }): Promise<GameState> {
  const data = await authedFetch<{ game: GameState }>('/api/me/tasks/game', {
    method: 'PUT',
    body: JSON.stringify(options),
  });
  return data.game;
}

export async function saveMyReminderSettings(settings: TaskReminderSettings): Promise<TaskReminderSettings> {
  const data = await authedFetch<{ settings: TaskReminderSettings }>('/api/me/tasks/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
  return data.settings;
}

export async function createMyTask(input: PersonalTaskInput): Promise<{ task: PersonalTask } & GameReply> {
  return authedFetch('/api/me/tasks', { method: 'POST', body: JSON.stringify(input) });
}

/** `next` is the copy a repeating task made when this save finished it. */
export async function updateMyTask(
  id: string,
  input: PersonalTaskInput,
): Promise<{ task: PersonalTask; next?: PersonalTask | null } & GameReply> {
  return authedFetch(`/api/me/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteMyTask(id: string): Promise<void> {
  await authedFetch(`/api/me/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function clearMyDoneTasks(): Promise<string[]> {
  const data = await authedFetch<{ deleted: string[] }>('/api/me/tasks?status=done', { method: 'DELETE' });
  return data.deleted;
}

/** The whole queue, in its new order. */
export async function rankMyQueue(ids: string[]): Promise<void> {
  await authedFetch('/api/me/tasks/queue', { method: 'PUT', body: JSON.stringify({ ids }) });
}

export async function reorderMyTasks(ids: string[]): Promise<void> {
  await authedFetch('/api/me/tasks/reorder', { method: 'POST', body: JSON.stringify({ ids }) });
}

/** A game event with an id, so the screen can show and dismiss each one. */
export interface GameNotice {
  id: number;
  event: GameEvent;
}

/**
 * The list, and every change to it, for one page.
 *
 * Changes are drawn first and saved second, so a card lands where it was
 * dropped the moment it is dropped. A save that fails puts the list back the
 * way the server has it and says why — a card that silently jumps back is
 * worse than one that says it could not move.
 *
 * XP is the exception: it is never guessed in the browser. The server works
 * it out with the save and the number on screen is the one it sends back.
 */
export function usePersonalTasks() {
  const [tasks, setTasks] = useState<PersonalTask[] | null>(null);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<TaskReminderSettings>(DEFAULT_TASK_REMINDER_SETTINGS);
  const [columns, setColumns] = useState<BoardColumn[]>(DEFAULT_BOARD_COLUMNS);
  const [colorLabels, setColorLabels] = useState<ColorLabels>({});
  const [game, setGame] = useState<GameState | null>(null);
  const [notices, setNotices] = useState<GameNotice[]>([]);
  const [streak, setStreak] = useState<TaskStreak>(EMPTY_TASK_STREAK);
  const noticeId = useRef(0);

  const takeGame = useCallback((reply: GameReply) => {
    if (reply.game) setGame(reply.game);
    if (reply.streak) setStreak(reply.streak);
    const events = reply.events ?? [];
    if (events.length) {
      setNotices((list) => [...list, ...events.map((event) => ({ id: ++noticeId.current, event }))]);
    }
  }, []);

  const dismissNotice = useCallback((id: number) => {
    setNotices((list) => list.filter((n) => n.id !== id));
  }, []);

  const reload = useCallback(async () => {
    try {
      const data = await listMyTasks();
      setTasks(data.tasks);
      setSettings(data.settings);
      setColumns(data.columns);
      setColorLabels(data.colorLabels);
      takeGame(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your list');
      setTasks((t) => t ?? []);
    }
  }, [takeGame]);

  useEffect(() => { reload(); }, [reload]);

  const fail = useCallback((e: unknown, what: string) => {
    setError(e instanceof Error ? e.message : what);
    reload();
  }, [reload]);

  /** A save's answer: the task as stored, the next copy of a repeating one, and the game. */
  const took = useCallback((reply: Awaited<ReturnType<typeof updateMyTask>>) => {
    setTasks((list) => {
      const out = (list ?? []).map((t) => (t.id === reply.task.id ? reply.task : t));
      return reply.next && !out.some((t) => t.id === reply.next!.id) ? [...out, reply.next] : out;
    });
    takeGame(reply);
  }, [takeGame]);

  const create = useCallback(async (input: PersonalTaskInput) => {
    setError('');
    try {
      const reply = await createMyTask(input);
      setTasks((list) => [...(list ?? []), reply.task]);
      takeGame(reply);
      return reply.task;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that');
      return null;
    }
  }, [takeGame]);

  const update = useCallback(async (id: string, input: PersonalTaskInput) => {
    setError('');
    setTasks((list) => (list ?? []).map((t) => (t.id === id ? { ...t, ...input } : t)));
    try {
      took(await updateMyTask(id, input));
    } catch (e) {
      fail(e, 'Could not save that');
    }
  }, [fail, took]);

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
      if (Object.keys(patch).length) took(await updateMyTask(id, patch));
      await reorderMyTasks(ids);
    } catch (e) {
      fail(e, 'Could not move that');
    }
  }, [update, fail, took]);

  /** The whole open queue in its new order: each gets its position as its place. Drawn first. */
  const rankQueue = useCallback(async (ids: string[]) => {
    setError('');
    const rank = new Map(ids.map((id, i) => [id, i + 1]));
    setTasks((list) => (list ?? []).map((t) => (rank.has(t.id) ? { ...t, rank: rank.get(t.id)! } : t)));
    try {
      await rankMyQueue(ids);
    } catch (e) {
      fail(e, 'Could not reorder your queue');
    }
  }, [fail]);

  const saveSettings = useCallback(async (next: TaskReminderSettings) => {
    setError('');
    setSettings(next);
    try {
      setSettings(await saveMyReminderSettings(next));
    } catch (e) {
      fail(e, 'Could not save your reminder settings');
    }
  }, [fail]);

  /**
   * Drawn first like everything else. A hide or a delete moves tasks on the
   * server, so the list is read again whenever any were — the browser does
   * not try to work out the same moves a second time.
   */
  const saveColumns = useCallback(async (next: BoardColumn[]) => {
    setError('');
    setColumns(next);
    try {
      const saved = await saveMyBoardColumns(next);
      setColumns(saved.columns);
      if (saved.moved > 0) await reload();
    } catch (e) {
      fail(e, 'Could not save your columns');
    }
  }, [fail, reload]);

  const saveColorLabels = useCallback(async (next: ColorLabels) => {
    setError('');
    setColorLabels(next);
    try {
      setColorLabels(await saveMyColorLabels(next));
    } catch (e) {
      fail(e, 'Could not save your colour names');
    }
  }, [fail]);

  const saveGameOptions = useCallback(async (options: { enabled?: boolean; theme?: GameTheme }) => {
    setError('');
    setGame((g) => (g ? { ...g, ...options } : g));
    try {
      setGame(await saveMyGameOptions(options));
    } catch (e) {
      fail(e, 'Could not save game mode');
    }
  }, [fail]);

  return {
    tasks, settings, columns, colorLabels, game, streak, notices, error, setError, reload,
    create, update, remove, clearDone, move, rankQueue, saveSettings, saveColumns, saveColorLabels, saveGameOptions, dismissNotice,
  };
}
