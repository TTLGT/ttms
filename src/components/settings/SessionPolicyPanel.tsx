'use client';

import { useEffect, useState } from 'react';
import { getAppSettings, saveSessionPolicy } from '@/lib/appSettings';
import {
  DEFAULT_SESSION_POLICY,
  IDLE_MINUTE_OPTIONS,
  MAX_DAY_OPTIONS,
  idleLabel,
  maxDaysLabel,
  type SessionPolicy,
} from '@/types/sessionPolicy';
import { Bi } from '@/components/spanish/Es';

/**
 * How long a sign-in lasts, for the whole company. Admins only
 * (`settings.manage`). See src/types/sessionPolicy.ts.
 *
 * Two dropdowns from fixed lists rather than typed numbers: a slip of the
 * keyboard here signs everybody out every minute.
 */
export default function SessionPolicyPanel() {
  const [policy, setPolicy]   = useState<SessionPolicy>(DEFAULT_SESSION_POLICY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');
  const [done, setDone]       = useState('');

  useEffect(() => {
    getAppSettings()
      .then((res) => setPolicy(res.settings.sessionPolicy))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load the setting'))
      .finally(() => setLoading(false));
  }, []);

  async function choose(next: SessionPolicy) {
    if (busy) return;
    const previous = policy;
    setPolicy(next);
    setBusy(true);
    setError('');
    setDone('');
    try {
      await saveSessionPolicy(next);
      setDone('Saved. It applies to each person from their next page load.');
    } catch (e) {
      setPolicy(previous);
      setError(e instanceof Error ? e.message : 'Failed to save the setting');
    } finally {
      setBusy(false);
    }
  }

  const select = 'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 data-es className="text-sm font-semibold uppercase tracking-wide text-gray-900">Sign-out Timer</h2>
      <p className="mb-4 mt-1 text-sm text-gray-500">
        <Bi>When TTMS signs a browser out by itself, so a lost laptop or an unlocked computer does not stay open to the company&apos;s data. Signing out never clocks anybody out.</Bi>
      </p>

      {loading ? (
        <p data-es className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-4">
          <label className="block">
            <span data-es className="text-sm font-medium text-gray-700">Sign out after this long unused</span>
            <select
              className={select}
              value={policy.idleMinutes}
              disabled={busy}
              onChange={(e) => void choose({ ...policy, idleMinutes: Number(e.target.value) })}
            >
              {IDLE_MINUTE_OPTIONS.map((m) => (
                <option key={m} value={m}>{idleLabel(m)}</option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-gray-500">
              <Bi>No click, key or scroll in any TTMS tab — or, while clocked in, no use of the computer at all where Chrome or Edge allow TTMS to see it. A one-minute warning comes first, with a button to stay signed in.</Bi>
            </span>
          </label>

          <label className="block">
            <span data-es className="text-sm font-medium text-gray-700">Sign in again every</span>
            <select
              className={select}
              value={policy.maxDays}
              disabled={busy}
              onChange={(e) => void choose({ ...policy, maxDays: Number(e.target.value) })}
            >
              {MAX_DAY_OPTIONS.map((d) => (
                <option key={d} value={d}>{maxDaysLabel(d)}</option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-gray-500">
              <Bi>However busy somebody is. They get five minutes&apos; warning to save their work.</Bi>
            </span>
          </label>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {done && <p className="mt-3 text-sm text-green-700">{done}</p>}
    </section>
  );
}
