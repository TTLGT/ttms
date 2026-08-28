'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronRight, Database, History, MapPin, Route, Tag, UserPlus, Users, Users2, Shield,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { listAllowedUsers } from '@/lib/allowedUsers';
import { listSites } from '@/lib/sites';
import { listTeams } from '@/lib/teams';
import { listWorkGroups } from '@/lib/workGroups';
import { listLeadSources } from '@/lib/leadSources';
import { getAppSettingsOrDefaults } from '@/lib/appSettings';
import type { LaneDistanceMode } from '@/types/appSettings';
import {
  SETTINGS_SECTIONS,
  sectionHref,
  type SettingsSection,
} from '@/components/settings/settingsSections';

/**
 * The Settings landing tab: every panel in the system on one screen, each with
 * the number or the setting it currently holds.
 *
 * The point of the numbers is that the common question about most of these is
 * not "let me change it" but "what is it set to" — how many people have
 * access, are we still on the free distance method. Answering that here saves
 * opening the tab at all.
 */

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  'people-list':   Users,
  'add-people':    UserPlus,
  'removed-people': History,
  'sites':         MapPin,
  'teams':         Users2,
  'work-groups':   Shield,
  'lane-distance': Route,
  'lead-sources':  Tag,
  'bats-import':   Database,
};

const GROUPS: { tab: SettingsSection['tab']; heading: string }[] = [
  { tab: 'people',       heading: 'People' },
  { tab: 'organization', heading: 'Organization' },
  { tab: 'operations',   heading: 'Operations' },
  { tab: 'data',         heading: 'Data' },
];

const LANE_MODE_LABEL: Record<LaneDistanceMode, string> = {
  off:      'Off',
  estimate: 'Estimate — free',
  routes:   'Google Routes — billed',
};

/** What each card shows on its right. Absent means the card carries no value. */
type Values = Partial<Record<string, string>>;

export default function SettingsOverviewPage() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [values, setValues] = useState<Values>({});
  const [loading, setLoading] = useState(true);

  // HR has one tab, so an overview of tabs they cannot open is nothing but a
  // wall of locked doors. Send them where they were going.
  useEffect(() => {
    if (!isAdmin) router.replace('/dashboard/settings/people');
  }, [isAdmin, router]);

  useEffect(() => {
    if (!isAdmin) return;
    let live = true;

    // Deliberately not counting removed people: that archive keeps date of
    // birth and personal email for people who have left, and pulling it to
    // print a number on a card would fetch that for every visit to Settings.
    // The card links to it; opening it is a decision.
    void Promise.all([
      listAllowedUsers().then((r) => r.length).catch(() => null),
      listSites().then((r) => r.length).catch(() => null),
      listTeams().then((r) => r.length).catch(() => null),
      listWorkGroups().then((r) => r.length).catch(() => null),
      listLeadSources().then((r) => r.length).catch(() => null),
      getAppSettingsOrDefaults().then((r) => r.settings.laneDistanceMode),
    ]).then(([people, sites, teams, groups, sources, laneMode]) => {
      if (!live) return;
      const count = (n: number | null, one: string, many: string) =>
        // A failed read shows nothing rather than a zero, which would read as
        // "there are none" and send someone looking for what went missing.
        n === null ? undefined : `${n} ${n === 1 ? one : many}`;
      setValues({
        'people-list':   count(people,  'person', 'people'),
        'sites':         count(sites,   'site',   'sites'),
        'teams':         count(teams,   'team',   'teams'),
        'work-groups':   count(groups,  'group',  'groups'),
        'lead-sources':  count(sources, 'source', 'sources'),
        'lane-distance': LANE_MODE_LABEL[laneMode],
      });
      setLoading(false);
    });

    return () => { live = false; };
  }, [isAdmin]);

  if (!isAdmin) return null;

  return (
    <div className="space-y-8">
      {GROUPS.map(({ tab, heading }) => {
        const sections = SETTINGS_SECTIONS.filter((s) => s.tab === tab);
        if (sections.length === 0) return null;

        return (
          <section key={tab}>
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              {heading}
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {sections.map((section) => {
                const Icon = ICONS[section.id] ?? Users;
                const value = values[section.id];
                return (
                  <Link
                    key={section.id}
                    href={sectionHref(section)}
                    className="group flex flex-col rounded-xl border border-gray-200 bg-white p-4 transition hover:border-brand-300 hover:shadow-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Icon size={15} className="flex-shrink-0 text-gray-400" />
                      <span className="text-sm font-semibold text-gray-900">{section.label}</span>
                      <ChevronRight
                        size={14}
                        className="ml-auto flex-shrink-0 text-gray-300 transition group-hover:text-brand-500"
                      />
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-gray-500">{section.blurb}</p>
                    {value ? (
                      <p className="mt-2 text-xs font-semibold text-brand-700">{value}</p>
                    ) : (
                      /* Holds the line's height whether or not this card has a
                         value, so cards in a row stay the same size. */
                      <p className="mt-2 text-xs font-semibold text-gray-300">
                        {loading ? '·' : ' '}
                      </p>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
