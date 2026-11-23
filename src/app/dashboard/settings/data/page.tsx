'use client';

import LegacyRedirect from '@/components/settings/LegacyRedirect';

/**
 * The old "data" tab. Settings has one page per setting now; this sends a
 * bookmark or an old link (with its #anchor) to the page that holds it.
 */
export default function Page() {
  return <LegacyRedirect tab="data" />;
}
