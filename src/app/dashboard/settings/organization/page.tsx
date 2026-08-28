'use client';

import SitesPanel from '@/components/settings/SitesPanel';
import TeamsPanel from '@/components/settings/TeamsPanel';
import WorkGroupsPanel from '@/components/settings/WorkGroupsPanel';

/**
 * Who works where, who reports to whom, and who can see whose records.
 *
 * The three belong together because they are all "shape of the company", but
 * only Work Groups grants anything — sites and teams are reference data. The
 * panels each load their own rows; nothing is shared between them, so nothing
 * is passed down.
 */

export default function SettingsOrganizationPage() {
  return (
    /* The first panel brings its own mt-6, which lands on top of the gap the
       layout already leaves under the tabs. Cancel it so every tab starts at
       the same height and switching between them does not shift the page. */
    <div className="-mt-6">
      <div id="sites" className="scroll-mt-44">
        <SitesPanel />
      </div>
      <div id="teams" className="scroll-mt-44">
        <TeamsPanel />
      </div>
      <div id="work-groups" className="scroll-mt-44">
        <WorkGroupsPanel />
      </div>
    </div>
  );
}
