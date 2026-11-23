'use client';

import SessionPolicyPanel from '@/components/settings/SessionPolicyPanel';

/**
 * Settings → Security: when TTMS signs a browser out by itself.
 * Who may open it is decided once, in settingsSections.ts, and enforced by the
 * Settings layout; the route behind the panel checks again.
 */
export default function Page() {
  return <SessionPolicyPanel />;
}
