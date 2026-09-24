'use client';

import { useAuth } from '@/context/AuthContext';
import CelebrationsPanel from '@/components/settings/CelebrationsPanel';
import DateFormatPanel from '@/components/settings/DateFormatPanel';
import LaneDistancePanel from '@/components/settings/LaneDistancePanel';
import LeadSourcesPanel from '@/components/settings/LeadSourcesPanel';
import PaymentMethodsPanel from '@/components/settings/PaymentMethodsPanel';

/**
 * Company-wide choices that change how orders behave, rather than who can see
 * them. Lane Distance is the one with a bill attached — see the panel.
 *
 * Two columns rather than stacked, so Lead Sources is not a scroll away. The
 * two choose-one-option panels share a column and the list of sources — which
 * grows with the company, and is the only one here that gets long — takes the
 * other. Panel widths are unchanged: the layout widens the page to fit two of
 * them side by side.
 *
 * **The panels are filtered, not just the tab.** Most of this tab is
 * `settings.manage`, but four panels have a narrower permission of their own:
 * Celebrations (`celebrations.manage`, HR), Lead Sources
 * (`leadSources.manage`, dispatch), and Lane Distance and Payment Terms
 * (`laneDistance.manage` / `paymentTerms.manage`, finance). The layout lets
 * each of them through the door; this decides what is in the room. Drawing
 * a control somebody cannot use is worse than hiding it: the route refuses the
 * save, and they find out after choosing.
 */

export default function SettingsOperationsPage() {
  const { can } = useAuth();
  const settings     = can('settings.manage');
  const celebrations = can('celebrations.manage');
  // Each narrow permission is a way in beside settings.manage, never instead
  // of it — the API accepts either, and so does this.
  const laneDistance = settings || can('laneDistance.manage');
  const paymentTerms = settings || can('paymentTerms.manage');
  const leadSources  = settings || can('leadSources.manage');

  const left  = laneDistance || settings || paymentTerms;
  const right = leadSources || celebrations;

  // One column when only one side has anything in it. Two columns with a
  // single card in the left of them is a card floating beside an empty
  // half-screen.
  const columns = left && right ? 'xl:grid-cols-2' : '';

  return (
    <div className={`grid items-start gap-6 ${columns}`}>
      {left && (
        <div className="space-y-6">
          {laneDistance && (
            <div id="lane-distance" className="scroll-mt-44">
              <LaneDistancePanel />
            </div>
          )}
          {settings && (
            <div id="date-format" className="scroll-mt-44">
              <DateFormatPanel />
            </div>
          )}
          {paymentTerms && (
            <div id="payment-methods" className="scroll-mt-44">
              <PaymentMethodsPanel />
            </div>
          )}
        </div>
      )}

      {right && (
        <div className="space-y-6">
          {leadSources && (
            <div id="lead-sources" className="scroll-mt-44">
              <LeadSourcesPanel />
            </div>
          )}
          {celebrations && (
            <div id="celebrations" className="scroll-mt-44">
              <CelebrationsPanel />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
