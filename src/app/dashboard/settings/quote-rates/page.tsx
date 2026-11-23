'use client';

import QuoteRatesPanel from '@/components/settings/QuoteRatesPanel';

/**
 * Settings → Quote rates: the card the quote calculator prices with.
 * Who may open it is decided once, in settingsSections.ts, and enforced by the
 * Settings layout; the route behind the panel checks again.
 */
export default function Page() {
  return <QuoteRatesPanel />;
}
