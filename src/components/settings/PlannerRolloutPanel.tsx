'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getPlannerRollout, savePlannerRollout } from '@/lib/planner';
import { listManageableUsers } from '@/lib/allowedUsers';
import type { AllowedUser } from '@/types/allowedUser';
import {
  DEFAULT_PLANNER_ROLLOUT, MAX_PLANNER_CHOSEN, PLANNER_STAGE_LABEL,
  type PlannerRollout, type PlannerStage,
} from '@/types/planner';
import { useSaveBarEntry } from './kit/SaveBar';
import { Loading, Notice, OptionCards, SettingsCard } from './kit/ui';

/**
 * Settings → Planner: who has the new Planner while it is rolled out. See
 * src/types/planner.ts.
 *
 * Four stages and, for the first two, a list of people. Admins only
 * (`settings.manage`), saved through the Save bar and recorded in the
 * settings change log by PUT /api/planner/rollout.
 */

const STAGE_DETAIL: Record<PlannerStage, string> = {
  nobody:   'Everyone keeps My tasks and the Calendar exactly as they are.',
  chosen:   'Only the people you pick below have the Planner. They can go back to the old pages themselves, one click each way.',
  optIn:    'Everybody sees “Try the new Planner” on My tasks and the Calendar and can switch back. The people you pick start on it.',
  everyone: 'The switch disappears: everybody has the Planner, and the old My tasks and Calendar links open its tabs.',
};

const nameOf = (u: AllowedUser) =>
  u.displayName || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;

const same = (a: PlannerRollout, b: PlannerRollout) =>
  a.stage === b.stage && a.chosenEmails.join('|') === [...b.chosenEmails].join('|');

export default function PlannerRolloutPanel() {
  const { profile } = useAuth();
  const [saved, setSaved] = useState<PlannerRollout>(DEFAULT_PLANNER_ROLLOUT);
  const [draft, setDraft] = useState<PlannerRollout>(DEFAULT_PLANNER_ROLLOUT);
  const [people, setPeople] = useState<AllowedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    let live = true;
    Promise.all([getPlannerRollout(), listManageableUsers(profile).catch(() => [] as AllowedUser[])])
      .then(([r, list]) => {
        if (!live) return;
        setSaved(r);
        setDraft(r);
        setPeople(list.filter((u) => !u.suspended));
      })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : 'Could not load the setting'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // The profile only decides which way the people list is read; once is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (next: PlannerRollout) => {
    const stored = await savePlannerRollout(next);
    setSaved(stored);
    setDraft(stored);
  };

  const { active } = useSaveBarEntry({
    dirty: !loading && !same(draft, saved),
    save: async () => {
      const previous = saved;
      await save(draft);
      return async () => { await save(previous); };
    },
    discard: () => setDraft(saved),
  });

  const byEmail = useMemo(() => new Map(people.map((u) => [u.email.toLowerCase(), u])), [people]);
  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return people
      .filter((u) => !draft.chosenEmails.includes(u.email.toLowerCase())
        && (nameOf(u).toLowerCase().includes(term) || u.email.toLowerCase().includes(term)))
      .slice(0, 8);
  }, [q, people, draft.chosenEmails]);

  const listMatters = draft.stage === 'chosen' || draft.stage === 'optIn';

  return (
    <SettingsCard
      id="planner-rollout"
      title="Who has the new Planner"
      description="The Planner puts Today, Tasks and the Calendar on one page. While it is being tried, My tasks and the Calendar keep working as they are, and both show the same tasks, so switching back and forth loses nothing."
    >
      {loading ? <Loading /> : (
        <div className="space-y-5">
          <OptionCards
            name="planner-stage"
            value={draft.stage}
            saved={saved.stage}
            onChange={(stage) => setDraft((d) => ({ ...d, stage }))}
            options={(['nobody', 'chosen', 'optIn', 'everyone'] as PlannerStage[]).map((s) => ({
              value: s, title: PLANNER_STAGE_LABEL[s], detail: STAGE_DETAIL[s],
            }))}
          />

          <div className={listMatters ? '' : 'opacity-60'}>
            <p className="text-sm font-semibold text-gray-900">
              People chosen <span className="font-normal text-gray-500">({draft.chosenEmails.length})</span>
            </p>
            <p className="text-sm text-gray-500">
              {listMatters
                ? draft.stage === 'chosen' ? 'They have the Planner; nobody else is offered it.' : 'They start on the Planner; everybody else is offered it.'
                : 'Kept for later, but not used at this stage.'}
            </p>
            {draft.chosenEmails.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {draft.chosenEmails.map((email) => {
                  const u = byEmail.get(email);
                  return (
                    <li key={email} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-sm text-brand-800">
                      {u ? nameOf(u) : email}
                      <button type="button" aria-label={`Remove ${u ? nameOf(u) : email}`}
                        onClick={() => setDraft((d) => ({ ...d, chosenEmails: d.chosenEmails.filter((e) => e !== email) }))}
                        className="text-brand-500 hover:text-brand-800"><X size={13} /></button>
                    </li>
                  );
                })}
              </ul>
            )}
            {draft.chosenEmails.length < MAX_PLANNER_CHOSEN && (
              <div className="relative mt-2 max-w-sm">
                <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a person by name or email"
                  className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                {matches.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                    {matches.map((u) => (
                      <li key={u.email}>
                        <button type="button"
                          onClick={() => { setDraft((d) => ({ ...d, chosenEmails: [...d.chosenEmails, u.email.toLowerCase()] })); setQ(''); }}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50">
                          <span className="font-medium text-gray-900">{nameOf(u)}</span>
                          <span className="block text-xs text-gray-500">{u.email}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <Notice tone="blue">
            Each person&rsquo;s own switch is remembered on their account. People on the Planner never get both the old planning card and the new one, and a plan shared from either version reaches Team plans the same way.
          </Notice>

          {!active && !same(draft, saved) && (
            <button type="button" onClick={() => void save(draft).catch((e) => setError(e instanceof Error ? e.message : 'Could not save'))}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Save</button>
          )}
        </div>
      )}
      {error && <Notice tone="red" className="mt-4">{error}</Notice>}
    </SettingsCard>
  );
}
