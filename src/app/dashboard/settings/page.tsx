'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, ChevronRight, Info, ScrollText } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { listManageableUsers } from '@/lib/allowedUsers';
import { listSites } from '@/lib/sites';
import { listTeams } from '@/lib/teams';
import { listWorkGroups } from '@/lib/workGroups';
import { listLeadSources } from '@/lib/leadSources';
import { listSettingsChanges } from '@/lib/settingsChanges';
import { formatCalendarDate } from '@/lib/dateFormat';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { idleLabel, maxDaysLabel } from '@/types/sessionPolicy';
import { AREA_LABEL, type SettingsChange } from '@/types/settingsChange';
import type { LaneDistanceMode } from '@/types/appSettings';
import { useSettingsData, type SettingsData } from '@/components/settings/SettingsData';
import {
  SETTINGS_GROUPS, SETTINGS_PAGES, pageHref, type SettingsAccess, type SettingsPage,
} from '@/components/settings/settingsSections';
import { SettingsCard } from '@/components/settings/kit/ui';
import { Bi } from '@/components/spanish/Es';

/**
 * Settings Home: what needs a look, how far the company's setup has got, and
 * what every setting the reader looks after is set to now.
 *
 * The question asked of most settings is not "let me change it" but "what is
 * it set to" — are we still on the free distance method, did anybody save a
 * company schedule. Home answers that without opening anything.
 *
 * Counts are read here and nowhere else in Settings' frame, and only the ones
 * the reader can open the page for: a finance person's Home never reads the
 * people list. The removal log is deliberately never counted — it holds the
 * payroll details of people who have left, and opening it is a decision.
 */

const LANE_LABEL: Record<LaneDistanceMode, string> = {
  off: 'Off', estimate: 'Free estimate', routes: 'Google Routes, billed',
};

interface Counts {
  people: number | null;
  sites: number | null;
  teams: number | null;
  groups: number | null;
  sources: number | null;
}

/** "Set up" steps for an admin. Each is a fact about the company, never about a person. */
function setupSteps(d: SettingsData, c: Counts, access: SettingsAccess) {
  const steps: { id: string; label: string; done: boolean; page: string }[] = [];
  if (!access.can('settings.manage')) return steps;
  steps.push({ id: 'sites', label: 'Add the offices', done: (c.sites ?? 0) > 0, page: 'sites' });
  steps.push({ id: 'teams', label: 'Set up the teams', done: (c.teams ?? 0) > 0, page: 'teams' });
  steps.push({
    id: 'payment', label: 'Fill in the payment terms',
    done: Boolean(d.app && d.app.settings.clientPaymentMethods.length > 0 && d.app.settings.carrierPaymentMethods.length > 0),
    page: 'payment-terms',
  });
  steps.push({ id: 'rates', label: 'Save the quote rates', done: Boolean(d.quoteRates && !d.quoteRates.isDefault), page: 'quote-rates' });
  steps.push({ id: 'sources', label: 'Add the lead sources', done: (c.sources ?? 0) > 0, page: 'lead-sources' });
  if (access.can('attendance.manage')) {
    steps.push({ id: 'schedule', label: 'Save a company work schedule', done: Boolean(d.schedules?.fallback), page: 'schedules' });
    steps.push({ id: 'network', label: 'Add the office network', done: (d.attendanceConfig?.officeNetworks.length ?? 0) > 0, page: 'office-network' });
  }
  // "Decide" — off by choice counts as done; only never having chosen does not.
  steps.push({
    id: 'reminders', label: 'Decide whether reminders may be emailed',
    done: Boolean(d.app?.chosen?.includes('reminderEmails')), page: 'general',
  });
  return steps;
}

export default function SettingsHomePage() {
  const { can, profile } = useAuth();
  const data = useSettingsData();
  const { formatDateTime } = useDateFormatters();
  const access = useMemo<SettingsAccess>(() => ({ can, isSalesManager: profile?.isSalesManager === true }), [can, profile]);
  const [counts, setCounts] = useState<Counts>({ people: null, sites: null, teams: null, groups: null, sources: null });
  const [recent, setRecent] = useState<SettingsChange[] | null>(null);

  const pages = useMemo(() => SETTINGS_PAGES.filter((p) => p.id !== 'home' && p.access(access)), [access]);
  const opens = (id: string) => pages.some((p) => p.id === id);

  useEffect(() => {
    let live = true;
    const n = <T,>(when: boolean, fn: () => Promise<T[]>) => (when ? fn().then((r) => r.length).catch(() => null) : Promise.resolve(null));
    void Promise.all([
      n(opens('people'), () => listManageableUsers(profile)),
      n(opens('sites'), listSites),
      n(opens('teams'), listTeams),
      n(opens('work-groups'), listWorkGroups),
      n(opens('lead-sources'), listLeadSources),
    ]).then(([people, sites, teams, groups, sources]) => {
      if (live) setCounts({ people, sites, teams, groups, sources });
    });
    if (opens('change-log')) {
      listSettingsChanges({ limit: 5 }).then((r) => { if (live) setRecent(r); }).catch(() => { if (live) setRecent([]); });
    }
    return () => { live = false; };
    // `pages` follows the reader's permissions, which is what this depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages.length, profile]);

  const steps = setupSteps(data, counts, access);
  const attentionFor = (id: string) => data.attention.find((a) => a.page === id);

  return (
    <div className="space-y-6">
      {data.attention.length > 0 && (
        <SettingsCard title="Needs a look">
          <ul className="divide-y divide-gray-100">
            {data.attention.map((a) => {
              const page = SETTINGS_PAGES.find((p) => p.id === a.page);
              return (
                <li key={`${a.page}-${a.text}`}>
                  <Link href={pageHref(a.page)} className="group flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className={`mt-0.5 flex-shrink-0 ${a.tone === 'amber' ? 'text-amber-500' : 'text-blue-500'}`}>
                      {a.tone === 'amber' ? <AlertTriangle size={16} /> : <Info size={16} />}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-gray-700"><Bi>{a.text}</Bi></span>
                    <span className="flex flex-shrink-0 items-center gap-1 text-xs font-medium text-brand-700 group-hover:underline">
                      {page?.label} <ChevronRight size={13} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </SettingsCard>
      )}

      {steps.length > 0 && data.loaded && counts.sites !== null && <SetupCard steps={steps} />}

      <div>
        <h3 data-es className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">At a glance</h3>
        <div className="space-y-5">
          {SETTINGS_GROUPS.filter((g) => g.id !== 'home').map((group) => {
            const inGroup = pages.filter((p) => p.group === group.id);
            if (inGroup.length === 0) return null;
            return (
              <section key={group.id}>
                <p data-es className="mb-2 text-sm font-semibold text-gray-700">{group.label}</p>
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  {inGroup.map((p) => (
                    <Tile key={p.id} page={p} value={valueFor(p, data, counts)} attention={Boolean(attentionFor(p.id))} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {recent && recent.length > 0 && (
        <SettingsCard
          title="Recent changes"
          aside={<Link href={pageHref('change-log')} className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"><ScrollText size={13} /> <span data-es>Change log</span></Link>}
        >
          <ul className="space-y-2.5">
            {recent.map((c) => (
              <li key={c.id} className="flex items-start gap-3 text-sm">
                <Initials name={c.byName || c.byEmail} />
                <span className="min-w-0 flex-1">
                  <span className="text-gray-800"><span className="font-medium">{c.byName || c.byEmail}</span> · {c.summary}</span>
                  <span className="block text-xs text-gray-400">{AREA_LABEL[c.area]}{c.at ? ` · ${formatDateTime(c.at)}` : ''}</span>
                </span>
              </li>
            ))}
          </ul>
        </SettingsCard>
      )}
    </div>
  );
}

/** What a page is set to, in a few words — or null for a page that holds no value. */
function valueFor(p: SettingsPage, d: SettingsData, c: Counts): string | null {
  const s = d.app?.settings;
  const n = (v: number | null, one: string, many: string) => (v === null ? null : `${v} ${v === 1 ? one : many}`);
  switch (p.id) {
    case 'people': return n(c.people, 'person', 'people');
    case 'general': return s ? `${formatCalendarDate('2020-03-04', s.dateFormat)} · online status ${s.presence ? 'on' : 'off'} · reminder emails ${s.reminderEmails ? 'on' : 'off'}` : null;
    case 'security': return s ? `${s.sessionPolicy.idleMinutes ? `Signed out after ${idleLabel(s.sessionPolicy.idleMinutes)} unused` : 'Never signed out for being away'} · ${s.sessionPolicy.maxDays ? `every ${maxDaysLabel(s.sessionPolicy.maxDays)}` : 'no sign-in schedule'}` : null;
    case 'sites': return n(c.sites, 'site', 'sites');
    case 'teams': return n(c.teams, 'team', 'teams');
    case 'work-groups': return n(c.groups, 'group', 'groups');
    case 'lead-sources': return n(c.sources, 'source', 'sources');
    case 'lane-distance': return s ? LANE_LABEL[s.laneDistanceMode] : null;
    case 'payment-terms': return s ? `${s.clientPaymentMethods.length + s.carrierPaymentMethods.length + s.brokerFeeTermOptions.length} options` : null;
    case 'quote-rates': return d.quoteRates ? (d.quoteRates.isDefault ? 'The starting rates' : `${d.quoteRates.rates.trucks.length} trucks`) : null;
    case 'agreement-terms': {
      if (!d.terms) return null;
      const pending = d.terms.client.pending.length + d.terms.carrier.pending.length;
      const edited = !d.terms.client.isDefault || !d.terms.carrier.isDefault;
      return `${edited ? 'Edited terms' : 'The standard terms'}${pending ? ` · ${pending} waiting` : ''}`;
    }
    case 'celebrations': return s ? (s.celebrations ? 'Posting at 8am' : 'Switched off') : null;
    case 'schedules': return d.schedules ? (d.schedules.fallback ? `Company schedule · ${Object.keys(d.schedules.byEmail).length} of their own` : 'No company schedule') : null;
    case 'lunch-breaks': return d.attendanceConfig ? `Lunch ${d.attendanceConfig.reminders.lunch.at}–${d.attendanceConfig.reminders.lunch.until}` : null;
    case 'office-network': return d.attendanceConfig ? `${d.attendanceConfig.officeNetworks.length} network${d.attendanceConfig.officeNetworks.length === 1 ? '' : 's'} · alerts ${d.attendanceConfig.alerts ? 'on' : 'off'}` : null;
    default: return null;
  }
}

function Tile({ page, value, attention }: { page: SettingsPage; value: string | null; attention: boolean }) {
  return (
    <Link href={pageHref(page.id)}
      className={`group flex flex-col rounded-xl border p-4 transition hover:shadow-sm ${
        attention ? 'border-amber-200 bg-amber-50/60 hover:border-amber-300' : 'border-gray-200 bg-white hover:border-brand-300'
      }`}>
      <span className="flex items-center gap-2">
        <page.Icon size={15} className={attention ? 'text-amber-500' : 'text-gray-400'} />
        <span data-es className="text-sm font-semibold text-gray-900">{page.label}</span>
        <ChevronRight size={14} className="ml-auto text-gray-300 transition group-hover:text-brand-500" />
      </span>
      {value ? (
        <span className={`mt-1.5 text-sm font-medium ${attention ? 'text-amber-800' : 'text-brand-700'}`}>{value}</span>
      ) : (
        <span className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-gray-500">{page.blurb}</span>
      )}
    </Link>
  );
}

function Initials({ name }: { name: string }) {
  const tints = ['bg-blue-600', 'bg-teal-600', 'bg-orange-600', 'bg-violet-600', 'bg-rose-600', 'bg-emerald-600'];
  const hash = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const letters = name.split(/[\s@.]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${tints[hash % tints.length]}`}>
      {letters || '?'}
    </span>
  );
}

/**
 * How far the company's setup has got. The last step done plays the truck
 * from the anniversary card across the card, once per browser — the only
 * celebration in Settings, and it can happen once.
 */
function SetupCard({ steps }: { steps: { id: string; label: string; done: boolean; page: string }[] }) {
  const done = steps.filter((s) => s.done).length;
  const complete = done === steps.length;
  const [drive, setDrive] = useState(false);

  useEffect(() => {
    if (!complete) return;
    try {
      if (window.localStorage.getItem('ttms.settings.setupCelebrated') === '1') return;
      window.localStorage.setItem('ttms.settings.setupCelebrated', '1');
    } catch {
      return;
    }
    setDrive(true);
  }, [complete]);

  // Finished and already celebrated: the card has nothing left to ask.
  if (complete && !drive) return null;

  return (
    <SettingsCard
      title="Company setup"
      aside={<span className="text-sm font-semibold tabular-nums text-gray-600">{done} of {steps.length} done</span>}
    >
      <div className="relative">
        <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-brand-500 transition-all duration-700" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
        {drive && (
          <div aria-hidden className="setup-truck pointer-events-none absolute -top-5 left-0 w-full">
            <svg viewBox="0 0 64 28" width="64" height="28">
              <rect x="2" y="6" width="38" height="14" rx="2" fill="#1e40af" />
              <path d="M40 10 h12 l8 7 v3 h-20 z" fill="#1d4ed8" />
              <rect x="44" y="11" width="7" height="5" rx="1" fill="#dbeafe" />
              <circle cx="12" cy="22" r="4" fill="#111827" /><circle cx="50" cy="22" r="4" fill="#111827" />
            </svg>
          </div>
        )}
      </div>
      {complete ? (
        <p className="mt-4 text-sm font-medium text-green-700"><Bi>Everything is set up. Nice work.</Bi></p>
      ) : (
        <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
          {steps.map((s) => (
            <li key={s.id}>
              {s.done ? (
                <span className="flex items-center gap-2 text-sm text-gray-400">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-700"><Check size={12} /></span>
                  <span data-es className="line-through decoration-gray-300">{s.label}</span>
                </span>
              ) : (
                <Link href={pageHref(s.page)} className="group flex items-center gap-2 text-sm text-gray-800">
                  <span className="h-5 w-5 rounded-full border-2 border-amber-400" />
                  <span data-es className="group-hover:text-brand-700 group-hover:underline">{s.label}</span>
                  <ChevronRight size={13} className="text-gray-300 group-hover:text-brand-500" />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}
