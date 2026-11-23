'use client';

import TeamsPanel from '@/components/settings/TeamsPanel';

/**
 * Settings → Teams: who reports to whom, as a list or an org chart.
 * Who may open it is decided once, in settingsSections.ts, and enforced by the
 * Settings layout; the route behind the panel checks again.
 */
export default function Page() {
  return <TeamsPanel />;
}
