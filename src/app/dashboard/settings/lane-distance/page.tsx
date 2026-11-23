'use client';

import LaneDistancePanel from '@/components/settings/LaneDistancePanel';

/**
 * Settings → Lane distance: how order mileage is worked out.
 * Who may open it is decided once, in settingsSections.ts, and enforced by the
 * Settings layout; the route behind the panel checks again.
 */
export default function Page() {
  return <LaneDistancePanel />;
}
