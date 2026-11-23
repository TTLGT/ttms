'use client';

import { useEffect, useState } from 'react';
import { listSites } from '@/lib/sites';
import { listTeams } from '@/lib/teams';
import RemovedPeoplePanel from '@/components/settings/RemovedPeoplePanel';
import type { Site } from '@/types/site';
import type { Team } from '@/types/team';

/**
 * Settings → Removed people: the removal log, and putting somebody back. It
 * holds payroll details of people who have left, so it is `people.manage`
 * only — HR reads the live list and nothing else.
 */
export default function Page() {
  const [sites, setSites] = useState<Site[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  useEffect(() => {
    void listSites().then(setSites).catch(() => {});
    void listTeams().then(setTeams).catch(() => {});
  }, []);
  return <RemovedPeoplePanel sites={sites} teams={teams} onRestored={() => {}} />;
}
