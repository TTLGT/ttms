'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';
import { FMCSA_PAGE_LABEL, FMCSA_PAGE_SOURCES, fmcsaPageUrl, isShownInTtms } from '@/types/fmcsaPage';
import type { FmcsaPageSource } from '@/types/fmcsaPage';

/** The digits of a DOT or MC as typed — "MC-123456" and "123456" are one number. */
function digits(value: string): string {
  return value.replace(/\D/g, '');
}

type Lookup = {
  label: string;
  /** What the site is for, for the tooltip — a broker should know why they would open it. */
  title: string;
  href: string;
  /**
   * True where the site has no address that opens one carrier — it is a
   * search box, or it is behind a sign-in. The link then copies the number on
   * the way out, so the search is one paste.
   */
  paste?: boolean;
  /** FMCSA itself, which refuses addresses outside the US. */
  vpn?: boolean;
};

const FMCSA_TITLE: Record<FmcsaPageSource, string> = {
  safer: 'FMCSA company snapshot: operating status, authority, fleet and inspections',
  sms:   'FMCSA Safety Measurement System: safety scores, inspections and crashes',
  li:    'FMCSA L&I: authority history, insurance filings and cancellations',
};

/**
 * FMCSA turns the Guatemala office away without a VPN, so the pages TTMS can
 * fetch from the US open inside TTMS; the rest go straight to FMCSA and say
 * they need the VPN (see `FMCSA_PAGES_SHOWN_IN_TTMS` for why). The commercial
 * sites are linked to their front page: none of them publishes a per-carrier
 * address, and one that guessed wrong would land a broker on somebody else's
 * record mid-vetting.
 */
function lookups(carrierId: string, dot: string, mc: string): Lookup[] {
  const out: Lookup[] = [];
  for (const s of FMCSA_PAGE_SOURCES) {
    const url = fmcsaPageUrl(s, dot, mc);
    if (!url) continue;
    out.push(isShownInTtms(s)
      ? { label: FMCSA_PAGE_LABEL[s], title: FMCSA_TITLE[s],
          href: `/dashboard/carriers/${encodeURIComponent(carrierId)}/fmcsa/${s}` }
      : { label: FMCSA_PAGE_LABEL[s], title: `${FMCSA_TITLE[s]}. Opens on FMCSA — needs the US VPN from Guatemala.`,
          href: url, vpn: true });
  }
  out.push(
    { label: 'SaferWatch',     title: 'Carrier monitoring and fraud alerts (needs a SaferWatch sign-in)', href: 'https://www.saferwatch.com/', paste: true },
    { label: 'Broker Snapshot', title: 'Carrier history, contacts, inspections and authority timeline', href: 'https://brokersnapshot.com/', paste: true },
    { label: 'USDOT411',       title: 'Carrier lookup and reported problems',                           href: 'https://usdot411.com/', paste: true },
  );
  return out;
}

/**
 * Outside sources for vetting a carrier, one click each. TTMS's own FMCSA
 * check answers "may this carrier haul?"; these are where a broker goes for
 * the rest — inspection history, insurance changes, fraud reports — which
 * TTMS does not fetch and should not pretend to have checked.
 */
export default function CarrierLookupLinks({ carrierId, dot, mc }: { carrierId: string; dot: string; mc: string }) {
  const dotNo = digits(dot);
  const mcNo  = digits(mc);
  const [copied, setCopied] = useState('');

  if (!dotNo && !mcNo) return null;

  // DOT where there is one: every site searches by it, and not all by MC.
  const pasteValue = dotNo || mcNo;
  const pasteName  = dotNo ? 'DOT' : 'MC';

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs font-medium text-gray-500">Look up on</span>
        {lookups(carrierId, dotNo, mcNo).map((l) => (
          <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" title={l.title}
            // Not awaited: the link must open in the same click, or the
            // browser treats the new tab as a pop-up and blocks it.
            onClick={l.paste ? () => {
              copyToClipboard(pasteValue).then((ok) => setCopied(ok ? l.label : ''));
            } : undefined}
            className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
            {l.label}
            {l.vpn && <span className="px-1 rounded bg-gray-100 text-[10px] font-semibold text-gray-500">VPN</span>}
            <ExternalLink className="w-3 h-3" />
          </a>
        ))}
      </div>
      {copied && (
        <p className="text-xs text-gray-500">
          {pasteName} {pasteValue} copied — paste it into {copied}&apos;s search.
        </p>
      )}
    </div>
  );
}
