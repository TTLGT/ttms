/**
 * FMCSA's public carrier pages a broker is linked to, their addresses, and
 * which of them TTMS fetches from the US on the broker's behalf. Pure, so the
 * links in the browser and the route on the server read one list — the
 * fetching is in lib/fmcsaPages.
 */

export const FMCSA_PAGE_SOURCES = ['safer', 'sms', 'li'] as const;
export type FmcsaPageSource = (typeof FMCSA_PAGE_SOURCES)[number];

export function isFmcsaPageSource(v: string): v is FmcsaPageSource {
  return (FMCSA_PAGE_SOURCES as readonly string[]).includes(v);
}

/**
 * The ones TTMS fetches and shows itself. The others are only linked, and
 * from Guatemala need the US VPN — tried on 2026-10-28 and taken back out:
 *
 * - SMS draws its page with scripts in the browser, and the frame runs none,
 *   so it came through blank. Running FMCSA's scripts is not on the table.
 * - L&I puts a challenge question in front of every search. That is FMCSA
 *   keeping automated callers out on purpose; do not try to get past it.
 *
 * The route refuses anything not on this list.
 */
export const FMCSA_PAGES_SHOWN_IN_TTMS: readonly FmcsaPageSource[] = ['safer'];

export function isShownInTtms(source: FmcsaPageSource): boolean {
  return FMCSA_PAGES_SHOWN_IN_TTMS.includes(source);
}

export const FMCSA_PAGE_LABEL: Record<FmcsaPageSource, string> = {
  safer: 'SaferWeb',
  sms:   'FMCSA SMS',
  li:    'Licensing & Insurance',
};

/**
 * The page's address on FMCSA, or null when the carrier lacks the number it
 * needs. SaferWeb is the only one that can be asked by MC; SMS and L&I key on
 * the DOT alone.
 */
export function fmcsaPageUrl(source: FmcsaPageSource, dot: string, mc: string): string | null {
  switch (source) {
    case 'safer':
      if (dot) return `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${dot}`;
      if (mc)  return `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=MC_MX&query_string=${mc}`;
      return null;
    case 'sms':
      return dot ? `https://ai.fmcsa.dot.gov/SMS/Carrier/${dot}/CarrierOverview.aspx` : null;
    case 'li':
      return dot
        ? `https://li-public.fmcsa.dot.gov/LIVIEW/pkg_carrquery.prc_carrlist?n_dotno=${dot}&s_prefix=MC&n_docketno=&s_legalname=&s_dbaname=&s_state=`
        : null;
  }
}
