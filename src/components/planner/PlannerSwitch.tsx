'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, X } from 'lucide-react';
import { choosePlanner, reportPlannerFeedback, usePlanner } from '@/lib/planner';
import { Bi } from '@/components/spanish/Es';

/*
 * The two halves of "Try the new Planner": the banner on the old pages, and
 * the way back from the Planner. One click each way; the choice is saved on
 * the account (preferences.planner), so it follows the person to another
 * computer. See src/types/planner.ts for who is offered either.
 */

/** Hidden for a week after "Not now", per browser. Asking every page load would be a nag. */
const SNOOZE_KEY = 'ttms.planner.tryLater';
const SNOOZE_DAYS = 7;

export function TryPlannerBanner({ tab }: { tab: 'tasks' | 'calendar' }) {
  const router = useRouter();
  const { state } = usePlanner();
  const [hidden, setHidden] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const until = Number(window.localStorage.getItem(SNOOZE_KEY) ?? 0);
      setHidden(until > Date.now());
    } catch {
      setHidden(false);
    }
  }, []);

  if (!state.canSwitch || state.on || hidden) return null;

  const later = () => {
    setHidden(true);
    try { window.localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86_400_000)); } catch { /* fine */ }
  };

  return (
    <div className="mx-4 mt-4 flex flex-wrap items-center gap-3 rounded-xl border-2 border-brand-500 bg-brand-50 px-4 py-3 sm:mx-6 lg:mx-8">
      <Sparkles size={18} className="shrink-0 text-brand-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-brand-800"><Bi>Try the new Planner</Bi></p>
        <p className="text-sm text-gray-600">
          <Bi>Your day, tasks and calendar in one place. Same tasks — you can come back here any time.</Bi>
        </p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await choosePlanner('new');
            router.push(`/dashboard/planner?tab=${tab === 'calendar' ? 'calendar' : 'today'}`);
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-lg bg-brand-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        Try it
      </button>
      <button type="button" onClick={later} className="text-sm text-gray-500 underline hover:text-gray-700">Not now</button>
    </div>
  );
}

/** "Back to the old pages", with an optional note on what did not work, sent to the IT desk. */
export function BackToOldDialog({ tab, onClose }: { tab: 'today' | 'tasks' | 'calendar'; onClose: () => void }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const go = async () => {
    setBusy(true);
    setError('');
    try {
      // The note first, so a failure to send it is said while they can still copy it.
      if (note.trim()) await reportPlannerFeedback(note);
      await choosePlanner('old');
      router.push(tab === 'calendar' ? '/dashboard/calendar' : '/dashboard/tasks');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not switch back. Try again.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-2">
          <h3 className="flex-1 text-lg font-semibold text-gray-900"><Bi>Back to the old pages</Bi></h3>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18} className="text-gray-400" /></button>
        </div>
        <p className="mt-1 text-sm text-gray-600">
          <Bi>You’ll have My tasks and the Calendar again, with every task exactly as it is. You can come back to the Planner any time.</Bi>
        </p>
        <label className="mt-4 block text-sm font-medium text-gray-700" htmlFor="planner-feedback">
          What didn&rsquo;t work for you? <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <textarea
          id="planner-feedback"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={2000}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <p className="mt-1 text-xs text-gray-500">Sent to IT support as a ticket, so you&rsquo;ll see any answer there.</p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Stay on the Planner
          </button>
          <button type="button" onClick={go} disabled={busy}
            className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The old My tasks and Calendar pages, wrapped. Somebody who has the Planner
 * is sent to the matching tab (the old links keep working); somebody offered
 * it sees the banner. Nothing is drawn until the answer is in, so a Planner
 * user is not shown — and charged the reads of — the old page on the way.
 */
export function OldPlannerPage({ tab, children }: { tab: 'tasks' | 'calendar'; children: React.ReactNode }) {
  const router = useRouter();
  const { state, loaded } = usePlanner();

  useEffect(() => {
    if (loaded && state.on) router.replace(`/dashboard/planner?tab=${tab}`);
  }, [loaded, state.on, tab, router]);

  if (!loaded || state.on) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }
  return (
    <>
      <TryPlannerBanner tab={tab} />
      {children}
    </>
  );
}
