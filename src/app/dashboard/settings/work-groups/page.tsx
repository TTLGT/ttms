'use client';

import WorkGroupsPanel from '@/components/settings/WorkGroupsPanel';

/**
 * Settings → Work groups: who can see whose clients and loads.
 * Who may open it is decided once, in settingsSections.ts, and enforced by the
 * Settings layout; the route behind the panel checks again.
 */
export default function Page() {
  return <WorkGroupsPanel />;
}
