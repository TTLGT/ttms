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
 *
 * They sit in two columns rather than stacked, because stacked meant scrolling
 * past all of Sites and Teams to reach Work Groups. Nothing shrank: the layout
 * widens the page to suit (see the tab layout), so a column here comes out
 * about as wide as the single column used to be.
 *
 * The split is by height, not by meaning. Work Groups is the tall one — a row
 * per group with its members listed under it — so it takes a column on its own
 * and the two shorter panels share the other. Two real columns rather than a
 * two-across grid: a grid row is as tall as the tallest panel in it, which
 * would leave a hole beside the short one.
 */

export default function SettingsOrganizationPage() {
  return (
    /* Below xl there is not room for two readable columns, so it falls back to
       the single stack it was before. */
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <div className="space-y-6">
        <div id="sites" className="scroll-mt-44">
          <SitesPanel />
        </div>
        <div id="teams" className="scroll-mt-44">
          <TeamsPanel />
        </div>
      </div>

      <div id="work-groups" className="scroll-mt-44">
        <WorkGroupsPanel />
      </div>
    </div>
  );
}
