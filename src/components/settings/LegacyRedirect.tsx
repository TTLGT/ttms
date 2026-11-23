'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LEGACY_ANCHORS, LEGACY_TABS, pageHref } from './settingsSections';

/**
 * Sends an old Settings address to the page that holds it now.
 *
 * Settings was seven tabs with anchors (`/settings/operations#quote-rates`);
 * it is one page per setting now. The anchor never reaches the server, so the
 * move has to happen here in the browser — the anchor is read, looked up in
 * `LEGACY_ANCHORS`, and the address replaced (not pushed, so Back does not
 * bounce straight into the redirect again).
 */
export default function LegacyRedirect({ tab }: { tab: string }) {
  const router = useRouter();
  useEffect(() => {
    const anchor = decodeURIComponent(window.location.hash.slice(1));
    const hit = LEGACY_ANCHORS[anchor];
    router.replace(hit ? pageHref(hit.page, hit.anchor) : pageHref(LEGACY_TABS[tab] ?? 'home'));
  }, [router, tab]);
  return null;
}
