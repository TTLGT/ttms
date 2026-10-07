import { normalizePhone, isPhoneRegion } from '@/lib/phone';
import { officeDay } from '@/types/fmcsa';
import type {
  FmcsaInsuranceKind,
  FmcsaPendingCancellation,
  FmcsaPolicy,
  FmcsaRegistry,
  FmcsaSuspension,
} from '@/types/fmcsa';

/**
 * FMCSA's registration data from data.transportation.gov — the half of a
 * carrier check the live QCMobile lookup does not carry: the registered phone
 * and email, who insures the carrier and under what policy, cancellations
 * that are coming, and suspension notices.
 *
 * Open data, no sign-in and no key. `DOT_DATA_APP_TOKEN` is optional: without
 * one, requests are throttled per IP address, and on Vercel that address is
 * shared with other people's sites. A free token from the portal lifts it.
 *
 * **The "Motus" datasets, not the older ones of the same name.** FMCSA moved
 * registration into Motus on 2026-05-14, and the old `ActPendInsur` dataset
 * stopped receiving filings that day — it still answers, confidently, with
 * whatever was true in May. Census is the exception: it carried on, and is
 * where the phone and email are.
 *
 * Motus's insurance file is messier than the one it replaced: a policy
 * appears once per transaction (J.B. Hunt's excess policy is there four
 * times), and filings later cancelled stay in it. So a policy counts as
 * current only after `currentPolicies()` has taken the cancellations in the
 * history file off it.
 */

const BASE = 'https://data.transportation.gov/resource';
const DATASET = {
  census:      'az4n-8mr2', // Company Census File
  insurance:   'c5y8-a4uz', // Motus Insur – All With History
  history:     '3uet-3z4i', // Motus InsHist – All With History
  suspensions: 'wb4f-neki', // Motus RevokeSuspend – All With History
} as const;

const TIMEOUT_MS = 10_000;
/** Far more than any one carrier has; the cap only stops a runaway answer. */
const ROW_LIMIT = 200;
/** How far back a suspension notice is still worth mentioning. */
const SUSPENSION_LOOKBACK_DAYS = 365;

type Row = Record<string, string | undefined>;

async function rows(dataset: string, where: string, select?: string): Promise<Row[]> {
  const url = new URL(`${BASE}/${dataset}.json`);
  url.searchParams.set('$where', where);
  url.searchParams.set('$limit', String(ROW_LIMIT));
  if (select) url.searchParams.set('$select', select);

  const token = process.env.DOT_DATA_APP_TOKEN?.trim();
  const res = await fetch(url, {
    headers: token ? { 'X-App-Token': token } : {},
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`data.transportation.gov answered ${res.status}`);
  const body = await res.json();
  return Array.isArray(body) ? (body as Row[]) : [];
}

const str = (v: string | undefined) => (v ?? '').trim();

/** "20250707" → "2025-07-07"; '' for anything else. */
function isoDay(v: string | undefined): string {
  const d = str(v);
  return /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : '';
}

function kindOf(typeCode: string | undefined): FmcsaInsuranceKind {
  switch (str(typeCode)) {
    case '1': return 'liability';
    case '2': return 'cargo';
    case '3': return 'bond';
    default:  return 'other';
  }
}

/** "0" and "NONE" are what a self-insured carrier files as a policy number. */
function policyNumber(v: string | undefined): string {
  const p = str(v);
  return /^(0+|none|n\/a)$/i.test(p) ? '' : p;
}

/** One filing, however many transactions repeated it. */
function filingKey(r: Row): string {
  return [str(r.ins_type_code), str(r.policy_no).toUpperCase(), str(r.effective_date), str(r.insurance_company_name).toUpperCase()].join('|');
}

/**
 * The policies on file today, and the cancellations that are coming.
 *
 * A filing is gone once its history row says CANCEL or TERM/REPL with a
 * cancel date on or before today — or CANCEL with no date at all, which is
 * how filings older than Motus came across (J.B. Hunt's 1993 Palisades policy
 * is still in the insurance file, cancelled, with no date on it).
 *
 * A cancellation dated in the future leaves the policy in place and is
 * reported as pending, marked `replaced` when another current filing of the
 * same kind will still be standing after that date. TERM/REPL rows are never
 * reported as pending: the words mean a new filing took the old one's place,
 * and that is a renewal, not a lapse.
 */
function currentPolicies(insurance: Row[], history: Row[], today: string): {
  policies: FmcsaPolicy[];
  pendingCancellations: FmcsaPendingCancellation[];
} {
  const ended = new Set<string>();
  const ending = new Map<string, string>(); // filing → future cancel date
  for (const h of history) {
    const reason = str(h.filing_status_reason).toUpperCase();
    const cancel = isoDay(h.cancl_effective_date);
    const key = filingKey(h);
    if (!cancel) {
      if (reason === 'CANCEL') ended.add(key);
    } else if (cancel <= today) {
      ended.add(key);
    } else if (reason === 'CANCEL') {
      ending.set(key, cancel);
    }
  }

  const seen = new Set<string>();
  const live: { key: string; policy: FmcsaPolicy }[] = [];
  for (const r of insurance) {
    const key = filingKey(r);
    if (seen.has(key) || ended.has(key)) continue;
    seen.add(key);
    live.push({
      key,
      policy: {
        kind: kindOf(r.ins_type_code),
        excess: str(r.ins_class_code).toUpperCase() === 'E',
        company: str(r.insurance_company_name),
        policyNo: policyNumber(r.policy_no),
        effectiveDate: isoDay(r.effective_date),
        amount: Math.round(Number(r.max_cov_amount) || 0),
      },
    });
  }

  const pendingCancellations: FmcsaPendingCancellation[] = [];
  for (const { key, policy } of live) {
    const cancelDate = ending.get(key);
    if (!cancelDate) continue;
    const replaced = live.some((o) => o.key !== key && o.policy.kind === policy.kind && !ending.has(o.key));
    pendingCancellations.push({ kind: policy.kind, company: policy.company, policyNo: policy.policyNo, cancelDate, replaced });
  }

  return { policies: live.map((l) => l.policy), pendingCancellations };
}

/** Census `crgo_*` columns, in the words FMCSA's own snapshot uses. */
const CARGO_LABELS: Record<string, string> = {
  crgo_genfreight: 'General Freight',
  crgo_household: 'Household Goods',
  crgo_metalsheet: 'Metal: Sheets, Coils, Rolls',
  crgo_motoveh: 'Motor Vehicles',
  crgo_drivetow: 'Drive/Tow Away',
  crgo_logpole: 'Logs, Poles, Beams, Lumber',
  crgo_bldgmat: 'Building Materials',
  crgo_mobilehome: 'Mobile Homes',
  crgo_machlrg: 'Machinery, Large Objects',
  crgo_produce: 'Fresh Produce',
  crgo_liqgas: 'Liquids/Gases',
  crgo_intermodal: 'Intermodal Containers',
  crgo_passengers: 'Passengers',
  crgo_oilfield: 'Oilfield Equipment',
  crgo_livestock: 'Livestock',
  crgo_grainfeed: 'Grain, Feed, Hay',
  crgo_coalcoke: 'Coal/Coke',
  crgo_meat: 'Meat',
  crgo_garbage: 'Garbage/Refuse',
  crgo_usmail: 'US Mail',
  crgo_chem: 'Chemicals',
  crgo_drybulk: 'Commodities Dry Bulk',
  crgo_coldfood: 'Refrigerated Food',
  crgo_beverages: 'Beverages',
  crgo_paperprod: 'Paper Products',
  crgo_utility: 'Utilities',
  crgo_farmsupp: 'Agricultural/Farm Supplies',
  crgo_construct: 'Construction',
  crgo_waterwell: 'Water Well',
};

/**
 * A census phone written the way TTMS writes phones, in the carrier's own
 * country. Kept as FMCSA gave it when it is not a number that country uses,
 * rather than dropped — a broker can still read it.
 */
function phoneFor(raw: string | undefined, country: string): string {
  const digits = str(raw);
  if (!digits) return '';
  const region = isPhoneRegion(country) ? country : 'US';
  const n = normalizePhone(digits, region);
  return n.value || digits;
}

function mailing(r: Row): string {
  const cityState = [str(r.carrier_mailing_city), [str(r.carrier_mailing_state), str(r.carrier_mailing_zip)].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');
  return [str(r.carrier_mailing_street), cityState].filter(Boolean).join(', ');
}

/**
 * Everything the open data says about one DOT number, or null when it could
 * not be read. Null rather than a throw: this is the supporting half of a
 * check, and the live answer is worth having without it.
 */
export async function lookupRegistry(dot: string): Promise<FmcsaRegistry | null> {
  const digits = dot.replace(/\D+/g, '');
  if (!digits) return null;
  const today = officeDay();
  const since = new Date(Date.parse(today) - SUSPENSION_LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');

  try {
    const [census, insurance, history, suspensions] = await Promise.all([
      rows(DATASET.census, `dot_number='${digits}'`),
      rows(DATASET.insurance, `usdot_number='${digits}'`),
      rows(DATASET.history, `usdot_number='${digits}'`),
      rows(DATASET.suspensions, `usdot_number='${digits}' AND order1_effective_date >= '${since}'`),
    ]);

    const c: Row = census[0] ?? {};
    const country = str(c.phy_country).toUpperCase() || 'US';
    const { policies, pendingCancellations } = currentPolicies(insurance, history, today);

    const sus: FmcsaSuspension[] = suspensions.map((s) => ({
      authorityType: str(s.op_auth_type),
      notice: str(s.order1_type_desc),
      servedDate: isoDay(s.order1_serve_date),
      effectiveDate: isoDay(s.order1_effective_date),
      involuntary: /involuntary/i.test(str(s.order1_type_desc)),
    }));

    return {
      asOf: today,
      phone: phoneFor(c.phone, country),
      cellPhone: phoneFor(c.cell_phone, country),
      fax: phoneFor(c.fax, country),
      email: str(c.email_address).toLowerCase(),
      officer: str(c.company_officer_1),
      country,
      mailingAddress: mailing(c),
      mcs150Date: isoDay(c.mcs150_date),
      cargoTypes: Object.entries(CARGO_LABELS)
        .filter(([col]) => str(c[col]).toUpperCase() === 'X')
        .map(([, label]) => label)
        .concat(str(c.crgo_cargoothr).toUpperCase() === 'X' && str(c.crgo_cargoothr_desc) ? [str(c.crgo_cargoothr_desc)] : []),
      policies,
      pendingCancellations,
      suspensions: sus,
    };
  } catch {
    return null;
  }
}
