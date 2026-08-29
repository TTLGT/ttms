'use client';

import DateFormatPanel from '@/components/settings/DateFormatPanel';
import LaneDistancePanel from '@/components/settings/LaneDistancePanel';
import LeadSourcesPanel from '@/components/settings/LeadSourcesPanel';

/**
 * Company-wide choices that change how orders behave, rather than who can see
 * them. Lane Distance is the one with a bill attached — see the panel.
 *
 * Two columns rather than stacked, so Lead Sources is not a scroll away. The
 * two choose-one-option panels share a column and the list of sources — which
 * grows with the company, and is the only one here that gets long — takes the
 * other. Panel widths are unchanged: the layout widens the page to fit two of
 * them side by side.
 */

export default function SettingsOperationsPage() {
  return (
    /* Below xl there is not room for two readable columns, so it falls back to
       the single stack it was before. */
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <div className="space-y-6">
        <div id="lane-distance" className="scroll-mt-44">
          <LaneDistancePanel />
        </div>
        <div id="date-format" className="scroll-mt-44">
          <DateFormatPanel />
        </div>
      </div>

      <div id="lead-sources" className="scroll-mt-44">
        <LeadSourcesPanel />
      </div>
    </div>
  );
}
