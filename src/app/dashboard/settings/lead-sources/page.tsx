'use client';

import LeadSourcesPanel from '@/components/settings/LeadSourcesPanel';

/**
 * Settings → Lead sources: where new clients come from.
 * Who may open it is decided once, in settingsSections.ts, and enforced by the
 * Settings layout; the route behind the panel checks again.
 */
export default function Page() {
  return <LeadSourcesPanel />;
}
