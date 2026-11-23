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
import { useSaveBarEntry } from './kit/SaveBar';
import { Loading, Notice, PreviewBox, SettingRow, SettingsCard } from './kit/ui';

/**
 * How long a sign-in lasts, for the whole company. Admins only
 * (`settings.manage`). See src/types/sessionPolicy.ts.
 *
 * Two dropdowns from fixed lists rather than typed numbers: a slip of the
 * keyboard here signs everybody out every minute. The preview draws a working
 * day with the warning and the sign-out where they would land, because "3
 * hours" means little until you see it fall across somebody's lunch.
 */
export default function SessionPolicyPanel() {
  const [saved, setSaved] = useState<SessionPolicy>(DEFAULT_SESSION_POLICY);
  const [draft, setDraft] = useState<SessionPolicy>(DEFAULT_SESSION_POLICY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getAppSettings()
      .then((res) => { setSaved(res.settings.sessionPolicy); setDraft(res.settings.sessionPolicy); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load the setting'))
      .finally(() => setLoading(false));
  }, []);

  const dirty = !loading && (draft.idleMinutes !== saved.idleMinutes || draft.maxDays !== saved.maxDays);
  const { active } = useSaveBarEntry({
    dirty,
    save: async () => {
      const previous = saved;
      await saveSessionPolicy(draft);
      setSaved(draft);
      return async () => { await saveSessionPolicy(previous); setSaved(previous); setDraft(previous); };
    },
    discard: () => setDraft(saved),
  });

  const select = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';
  // Anything under an hour signs people out while they are on a call.
  const short = draft.idleMinutes > 0 && draft.idleMinutes < 60;

  return (
    <SettingsCard>
      {loading ? <Loading /> : (
        <>
          <SettingRow
            label="Sign out after this long unused"
            htmlFor="idle-minutes"
            help="No click, key or scroll in any TTMS tab — or, while clocked in, no use of the computer at all where Chrome or Edge allow TTMS to see it. A one-minute warning comes first, with a button to stay signed in."
          >
            <select id="idle-minutes" className={select} value={draft.idleMinutes}
              onChange={(e) => setDraft({ ...draft, idleMinutes: Number(e.target.value) })}>
              {IDLE_MINUTE_OPTIONS.map((m) => <option key={m} value={m}>{idleLabel(m)}</option>)}
            </select>
          </SettingRow>
          <SettingRow
            label="Sign in again every"
            htmlFor="max-days"
            help="However busy somebody is. They get five minutes’ warning to save their work."
          >
            <select id="max-days" className={select} value={draft.maxDays}
              onChange={(e) => setDraft({ ...draft, maxDays: Number(e.target.value) })}>
              {MAX_DAY_OPTIONS.map((d) => <option key={d} value={d}>{maxDaysLabel(d)}</option>)}
            </select>
          </SettingRow>

          {short && (
            <Notice tone="amber" className="mt-4" title="This is short">
              People on a long call or reading a contract will be signed out in the middle of it. Most offices use two hours or more.
            </Notice>
          )}

          <PreviewBox className="mt-5" title="A working day" note="An example day: in at 7:00, last touches TTMS at 12:00 and goes to lunch. Nothing here is saved until you press Save.">
            <WorkdayTimeline idleMinutes={draft.idleMinutes} />
            <p className="mt-3 text-sm text-gray-700">
              {draft.maxDays === 0
                ? <Bi>Nobody is asked to sign in again on a schedule.</Bi>
                : <Bi vars={{ when: maxDaysLabel(draft.maxDays).toLowerCase() }}>{'Somebody who signs in on Monday morning is asked to sign in again {when} later, with five minutes’ warning.'}</Bi>}
            </p>
          </PreviewBox>

          <p className="mt-4 text-xs text-gray-500">
            <Bi>A sign-out never clocks anybody out. It applies to each person from their next page load.</Bi>
          </p>
        </>
      )}
      {!active && dirty && (
        <button type="button" onClick={() => void saveSessionPolicy(draft).then(() => setSaved(draft))}
          className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Save</button>
      )}
      {error && <Notice tone="red" className="mt-4">{error}</Notice>}
    </SettingsCard>
  );
}

/** "12:00" style, from minutes after midnight. */
function hhmm(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * 7:00 to 19:00 as a bar, with the moment somebody walks away, the warning
 * and the sign-out marked on it. Past the end of the bar, it says so.
 */
function WorkdayTimeline({ idleMinutes }: { idleMinutes: number }) {
  const start = 7 * 60;
  const end = 19 * 60;
  const away = 12 * 60;
  const pct = (m: number) => `${((Math.min(Math.max(m, start), end) - start) / (end - start)) * 100}%`;

  if (idleMinutes === 0) {
    return <p className="text-sm text-gray-700"><Bi>Nobody is signed out for being away. A computer left unlocked stays signed in.</Bi></p>;
  }
  const out = away + idleMinutes;
  const warn = out - 1;
  const beyond = out > end;

  return (
    <div className="pt-6">
      <div className="relative h-2.5 rounded-full bg-gray-200">
        <div className="absolute inset-y-0 left-0 rounded-l-full bg-green-400" style={{ width: pct(away) }} />
        {!beyond && <div className="absolute inset-y-0 rounded-r-full bg-red-300" style={{ left: pct(out), right: 0 }} />}
        <Marker at={pct(away)} label="Away from desk" time={hhmm(away)} tone="text-gray-600" />
        {!beyond && <Marker at={pct(out)} label="Signed out" time={hhmm(out)} tone="text-red-600" below />}
      </div>
      <div className="mt-8 flex justify-between text-[11px] tabular-nums text-gray-400">
        <span>7:00</span><span>10:00</span><span>13:00</span><span>16:00</span><span>19:00</span>
      </div>
      <p className="mt-2 text-sm text-gray-700">
        {beyond
          ? <Bi vars={{ time: hhmm(out) }}>{'Still signed in at the end of the day — the sign-out would come at {time}.'}</Bi>
          : <Bi vars={{ warn: hhmm(warn), out: hhmm(out) }}>{'A warning at {warn}, and signed out at {out} unless they click Stay signed in.'}</Bi>}
      </p>
    </div>
  );
}

function Marker({ at, label, time, tone, below = false }: { at: string; label: string; time: string; tone: string; below?: boolean }) {
  return (
    <div className="absolute top-1/2 -translate-x-1/2" style={{ left: at }}>
      <div className="h-4 w-1 -translate-y-1/2 rounded bg-gray-700" />
      <div className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] ${tone} ${below ? 'top-3' : '-top-7'}`}>
        <span data-es className="font-semibold">{label}</span> <span className="tabular-nums">{time}</span>
      </div>
    </div>
  );
}
