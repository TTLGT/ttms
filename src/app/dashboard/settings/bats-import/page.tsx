'use client';

import BatsImportPanel from '@/components/settings/BatsImportPanel';

/**
 * Settings → BATS import: bringing records across from BATS.
 * Who may open it is decided once, in settingsSections.ts, and enforced by the
 * Settings layout; the route behind the panel checks again.
 */
export default function Page() {
  return <BatsImportPanel />;
}
