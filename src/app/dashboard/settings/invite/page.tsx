'use client';

import { useEffect, useState } from 'react';
import { listSites } from '@/lib/sites';
import { listTeams } from '@/lib/teams';
import AddPeoplePanel from '@/components/settings/AddPeoplePanel';
import type { Site } from '@/types/site';
import type { Team } from '@/types/team';

/**
 * Settings → Invite people: giving someone new access, typed in or from a
 * spreadsheet. `people.manage` only — enforced by the layout and again by
 * POST /api/admin/users.
 */
export default function Page() {
  const [sites, setSites] = useState<Site[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  useEffect(() => {
    void listSites().then(setSites).catch(() => {});
    void listTeams().then(setTeams).catch(() => {});
  }, []);
  return <AddPeoplePanel sites={sites} teams={teams} onChanged={() => {}} />;
}
