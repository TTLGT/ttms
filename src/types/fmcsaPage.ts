/**
 * FMCSA's public carrier pages that TTMS can fetch from the US on a broker's
 * behalf, and their addresses. Pure, so the links in the browser and the
 * route on the server read one list — the fetching is in lib/fmcsaPages.
 */

export const FMCSA_PAGE_SOURCES = ['safer', 'sms', 'li'] as const;
export type FmcsaPageSource = (typeof FMCSA_PAGE_SOURCES)[number];

export function isFmcsaPageSource(v: string): v is FmcsaPageSource {
  return (FMCSA_PAGE_SOURCES as readonly string[]).includes(v);
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
