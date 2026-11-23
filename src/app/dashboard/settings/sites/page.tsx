'use client';

import SitesPanel from '@/components/settings/SitesPanel';

/**
 * Settings → Sites: the offices people work from.
 * Who may open it is decided once, in settingsSections.ts, and enforced by the
 * Settings layout; the route behind the panel checks again.
 */
export default function Page() {
  return <SitesPanel />;
}
