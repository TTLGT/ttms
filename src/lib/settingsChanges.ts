import { useEffect, useState } from 'react';
import { auth } from './firebase';
import type { SettingsArea, SettingsChange } from '@/types/settingsChange';

/**
 * Browser access to the settings change log. See src/types/settingsChange.ts.
 * Read-only: entries are written by the server beside each save, never here.
 */

async function get<T>(url: string): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Could not load the change log');
  return data as T;
}

export function listSettingsChanges(opts: { area?: SettingsArea; limit?: number } = {}): Promise<SettingsChange[]> {
  const q = new URLSearchParams();
  if (opts.area) q.set('area', opts.area);
  if (opts.limit) q.set('limit', String(opts.limit));
  return get<{ changes: SettingsChange[] }>(`/api/settings-changes?${q}`).then((r) => r.changes);
}

/**
 * The newest entry for any of these areas — the "Last changed by" line under
 * a Settings page title. `version` re-reads it after a save on the page.
 * Null while loading and when nothing has been recorded yet.
 */
export function useLastChange(areas: readonly SettingsArea[], version = 0): SettingsChange | null {
  const [last, setLast] = useState<SettingsChange | null>(null);
  const key = areas.join(',');
  useEffect(() => {
    if (!key) { setLast(null); return; }
    let live = true;
    // One small document per area, not the log: this runs on every Settings
    // page view.
    get<{ changes: SettingsChange[] }>(`/api/settings-changes?latest=${encodeURIComponent(key)}`)
      .then(({ changes }) => {
        if (!live) return;
        const newest = [...changes].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))[0] ?? null;
        setLast(newest);
      })
      .catch(() => { if (live) setLast(null); });
    return () => { live = false; };
  }, [key, version]);
  return last;
}

/** How much a work group shares, for the preview on its page. */
export function workGroupReach(groupId: string): Promise<{ parties: number; ordersUpTo: number }> {
  return get(`/api/work-groups/${encodeURIComponent(groupId)}/reach`);
}
