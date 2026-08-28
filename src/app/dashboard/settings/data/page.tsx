'use client';

import BatsImportPanel from '@/components/settings/BatsImportPanel';

/**
 * Bringing records in from outside TTMS. One panel today; this is where the
 * next importer or export tool goes rather than on the end of another tab.
 */

export default function SettingsDataPage() {
  return (
    /* -mt-6 cancels the panel's own mt-6, so this tab starts level with the
       others rather than a gap lower. */
    <div id="bats-import" className="-mt-6 scroll-mt-44">
      <BatsImportPanel />
    </div>
  );
}
