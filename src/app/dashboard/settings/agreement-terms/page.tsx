'use client';

import AgreementTermsPanel from '@/components/settings/AgreementTermsPanel';

/**
 * Settings → Agreement terms: what clients and carriers sign.
 * Who may open it is decided once, in settingsSections.ts, and enforced by the
 * Settings layout; the route behind the panel checks again.
 */
export default function Page() {
  return <AgreementTermsPanel />;
}
