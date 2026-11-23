'use client';

import CelebrationsPanel from '@/components/settings/CelebrationsPanel';

/**
 * Settings → Celebrations: the birthday and anniversary post.
 * Who may open it is decided once, in settingsSections.ts, and enforced by the
 * Settings layout; the route behind the panel checks again.
 */
export default function Page() {
  return <CelebrationsPanel />;
}
