'use client';

import DateFormatPanel from '@/components/settings/DateFormatPanel';
import LaneDistancePanel from '@/components/settings/LaneDistancePanel';
import LeadSourcesPanel from '@/components/settings/LeadSourcesPanel';

/**
 * Company-wide choices that change how orders behave, rather than who can see
 * them. Lane Distance is the one with a bill attached — see the panel.
 */

export default function SettingsOperationsPage() {
  return (
    <div>
      <div id="lane-distance" className="scroll-mt-44">
        <LaneDistancePanel />
      </div>
      <div id="date-format" className="scroll-mt-44">
        <DateFormatPanel />
      </div>
      <div id="lead-sources" className="scroll-mt-44">
        <LeadSourcesPanel />
      </div>
    </div>
  );
}
