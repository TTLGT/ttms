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
 * **Insurance comes from two files, because neither is whole.** FMCSA moved
 * registration into Motus on 2026-05-14. The old `ActPendInsur` file stopped
 * receiving filings that day (nothing in it is transacted after 05/14/2026),
 * but Motus did not take everything across: on 2026-10-07 the old file held
 * about 468,000 active or pending filings and Motus's about 132,000. Route One
 * LLC's policy, filed on the day of the switch, is in the old file and not the
 * new one. Reading Motus alone left most carriers with no insurer at all.
 *
 * So Motus is read first and the old file fills the gaps, under three rules in
 * `mergeLegacy()`: a newer Motus filing of the same kind wins; a cancellation
 * Motus has recorded since applies to the old filing; and an old filing only
 * counts while FMCSA's live answer says insurance of that kind is still on
 * file. The third is the guard against the old file's frozen view: a policy
 * cancelled after May without a Motus history row would otherwise read as
 * current forever.
 *
 * Census is the exception to all this: it carried on through the switch, and
 * is where the phone and email are.
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
  legacy:      'qh9u-swkp', // ActPendInsur – All With History (pre-Motus, frozen 2026-05-14)
  authority:   'yu5v-wbh6', // Motus AuthHist – All With History
  legacyAuth:  '9mw4-x3tu', // AuthHist – All With History (pre-Motus, frozen 2026-05-14)
} as const;

const TIMEOUT_MS = 10_000;
/**
 * The census is the slow one: a lookup by DOT took 9 to 43 seconds when timed
 * on 2026-10-07, against well under a second for the insurance files. At the
 * ten seconds the others get it timed out on the live site and, back when the
 * four were all-or-nothing, took the insurer and policy down with it.
 */
const CENSUS_TIMEOUT_MS = 30_000;
/** Pauses before asking again after a "too many requests". */
const RETRY_WAITS_MS = [2_000, 5_000];
/** Far more than any one carrier has; the cap only stops a runaway answer. */
const ROW_LIMIT = 200;
/** How far back a suspension notice is still worth mentioning. */
const SUSPENSION_LOOKBACK_DAYS = 365;

type Row = Record<string, string | undefined>;

async function rows(dataset: string, where: string, select?: string, timeoutMs = TIMEOUT_MS): Promise<Row[]> {
  const url = new URL(`${BASE}/${dataset}.json`);
  url.searchParams.set('$where', where);
  url.searchParams.set('$limit', String(ROW_LIMIT));
  if (select) url.searchParams.set('$select', select);

  const token = process.env.DOT_DATA_APP_TOKEN?.trim();
  // "Too many requests" comes back fast and passes: on 2026-10-07 the census
  // refused the fourth lookup in a row even with a token, then answered again
  // seconds later. Waiting and asking again keeps a bulk check from losing
  // the phone and email of every other carrier.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: token ? { 'X-App-Token': token } : {},
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    if (res.status === 429 && attempt < RETRY_WAITS_MS.length) {
      await new Promise((r) => setTimeout(r, RETRY_WAITS_MS[attempt]));
      continue;
    }
    if (!res.ok) throw new Error(`data.transportation.gov answered ${res.status}`);
    const body = await res.json();
    return Array.isArray(body) ? (body as Row[]) : [];
  }
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
 * The same filing as seen from either file. The two write the insurer's name
 * differently ("Great American Insurance Company of New York" against
 * "OCCIDENTAL FIRE AND CASUALTY CO. OF N.C."), so the name is left out: kind,
 * policy number and start date are what identify a filing across them.
 */
function crossKey(kind: FmcsaInsuranceKind, policyNo: string, effectiveDate: string): string {
  return [kind, policyNo.toUpperCase().replace(/[^A-Z0-9]/g, ''), effectiveDate].join('|');
}

/** "05/28/2026" → "2026-05-28", the old file's way of writing a date. */
function usDay(v: string | undefined): string {
  const m = str(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
}

interface LiveFiling {
  cross: string;
  policy: FmcsaPolicy;
  /** A cancellation dated after today, when one is on file. */
  cancelDate?: string;
}

/**
 * Motus's view: the policies on file today, and what its history says about
 * every filing it knows — including ones only the old file holds.
 *
 * A filing is gone once its history row says CANCEL or TERM/REPL with a
 * cancel date on or before today — or CANCEL with no date at all, which is
 * how filings older than Motus came across (J.B. Hunt's 1993 Palisades policy
 * is still in the insurance file, cancelled, with no date on it).
 *
 * A cancellation dated in the future leaves the policy in place and is
 * reported as pending. TERM/REPL rows are never reported as pending: the
 * words mean a new filing took the old one's place, and that is a renewal,
 * not a lapse.
 */
function currentPolicies(insurance: Row[], history: Row[], today: string): {
  live: LiveFiling[];
  endedCross: Set<string>;
  endingCross: Map<string, string>;
} {
  const ended = new Set<string>();
  const ending = new Map<string, string>(); // filing → future cancel date
  const endedCross = new Set<string>();
  const endingCross = new Map<string, string>();
  for (const h of history) {
    const reason = str(h.filing_status_reason).toUpperCase();
    const cancel = isoDay(h.cancl_effective_date);
    const key = filingKey(h);
    const cross = crossKey(kindOf(h.ins_type_code), policyNumber(h.policy_no), isoDay(h.effective_date));
    if (!cancel) {
      if (reason === 'CANCEL') { ended.add(key); endedCross.add(cross); }
    } else if (cancel <= today) {
      ended.add(key);
      endedCross.add(cross);
    } else if (reason === 'CANCEL') {
      ending.set(key, cancel);
      endingCross.set(cross, cancel);
    }
  }

  const seen = new Set<string>();
  const live: LiveFiling[] = [];
  for (const r of insurance) {
    const key = filingKey(r);
    if (seen.has(key) || ended.has(key)) continue;
    seen.add(key);
    const policy: FmcsaPolicy = {
      kind: kindOf(r.ins_type_code),
      excess: str(r.ins_class_code).toUpperCase() === 'E',
      company: str(r.insurance_company_name),
      policyNo: policyNumber(r.policy_no),
      effectiveDate: isoDay(r.effective_date),
      amount: Math.round(Number(r.max_cov_amount) || 0),
    };
    live.push({ cross: crossKey(policy.kind, policy.policyNo, policy.effectiveDate), policy, cancelDate: ending.get(key) });
  }

  return { live, endedCross, endingCross };
}

/** The old file names a kind in words rather than Motus's type code. */
function legacyKind(label: string): FmcsaInsuranceKind {
  const l = label.toUpperCase();
  if (l.startsWith('BIPD')) return 'liability';
  if (l.startsWith('CARGO')) return 'cargo';
  if (l.startsWith('SURETY')) return 'bond';
  return 'other'; // TRUST FUND, which Motus files as type 4
}

/** What FMCSA's live answer says is on file: the guard on the old file. */
export interface OnFile {
  liability: number;
  cargo: number;
  bond: number;
}

function onFileFor(kind: FmcsaInsuranceKind, onFile: OnFile): number {
  return kind === 'liability' ? onFile.liability : kind === 'cargo' ? onFile.cargo : onFile.bond;
}

/**
 * Add the old file's filings that Motus is missing. See the note at the top
 * of this file for why each rule is there.
 */
function mergeLegacy(
  motus: ReturnType<typeof currentPolicies>,
  legacy: Row[],
  onFile: OnFile,
  today: string,
): LiveFiling[] {
  const out = [...motus.live];
  const have = new Set(out.map((l) => l.cross));

  for (const r of legacy) {
    const label = str(r.mod_col_1);
    const kind = legacyKind(label);
    const policy: FmcsaPolicy = {
      kind,
      excess: /excess/i.test(label),
      company: str(r.name_company),
      policyNo: policyNumber(r.policy_no),
      effectiveDate: usDay(r.effective_date),
      // The old file counts in thousands: "750" is $750,000.
      amount: Math.round((Number(r.max_cov_amount) || 0) * 1000),
    };
    const cross = crossKey(kind, policy.policyNo, policy.effectiveDate);
    const cancel = usDay(r.cancl_effective_date);

    if (have.has(cross)) continue;                   // Motus has it already
    if (cancel && cancel <= today) continue;         // ended by its own date
    if (motus.endedCross.has(cross)) continue;       // ended since, per Motus
    if (onFileFor(kind, onFile) <= 0) continue;      // FMCSA has none of this kind now
    const superseded = motus.live.some((m) =>
      m.policy.kind === kind && m.policy.excess === policy.excess && m.policy.effectiveDate >= policy.effectiveDate);
    if (superseded) continue;

    have.add(cross);
    out.push({ cross, policy, cancelDate: motus.endingCross.get(cross) ?? (cancel || undefined) });
  }
  return out;
}

/**
 * Pending cancellations across the merged list, marked `replaced` when another
 * current filing of the same kind will still be standing after that date.
 */
function pendingOf(live: LiveFiling[]): FmcsaPendingCancellation[] {
  const out: FmcsaPendingCancellation[] = [];
  for (const l of live) {
    if (!l.cancelDate) continue;
    const replaced = live.some((o) => o !== l && o.policy.kind === l.policy.kind && !o.cancelDate);
    out.push({ kind: l.policy.kind, company: l.policy.company, policyNo: l.policy.policyNo, cancelDate: l.cancelDate, replaced });
  }
  return out;
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
 * The day FMCSA first granted this DOT a carrier authority, '' when no grant
 * is on either file. Asked for the SA review's "operating 6 months" check.
 *
 * **Both files again, for the opposite reason to insurance.** Motus did not
 * carry original grant dates across: on 2026-10-08 J.B. Hunt's carrier
 * authority (granted in the 1970s) read there only as an "Administrative
 * Correction" dated August 2026, which taken alone would make the oldest
 * carrier in the country look two months old. So the old file is where the
 * history is, Motus is where any grant since May is, and the earliest
 * carrier grant across the two is the answer. Only grants count (Motus writes
 * "GRANTED" for rows it carried over and "Granted" for its own), and
 * only carrier authorities: a broker or forwarder authority on the same DOT
 * says nothing about how long it has run trucks.
 *
 * Fails alone, to '', like the census: an unknown date is reported as unknown
 * and never as a new carrier.
 */
async function authorityGranted(digits: string): Promise<string> {
  const [motus, legacy] = await Promise.all([
    rows(DATASET.authority, `usdot_number='${digits}' AND upper(reason)='GRANTED'`, 'op_auth_type,status_change_date')
      .catch(() => [] as Row[]),
    rows(DATASET.legacyAuth, `dot_number='${digits.padStart(8, '0')}' AND original_action_desc='GRANTED'`, 'mod_col_1,orig_served_date')
      .catch(() => [] as Row[]),
  ]);
  const days = [
    ...motus.filter((r) => /^motor carrier/i.test(str(r.op_auth_type))).map((r) => isoDay(r.status_change_date)),
    ...legacy.filter((r) => /carrier/i.test(str(r.mod_col_1))).map((r) => usDay(r.orig_served_date)),
  ].filter(Boolean).sort();
  return days[0] ?? '';
}

/**
 * Everything the open data says about one DOT number, or null when it could
 * not be read. Null rather than a throw: this is the supporting half of a
 * check, and the live answer is worth having without it.
 */
export async function lookupRegistry(dot: string, onFile: OnFile): Promise<FmcsaRegistry | null> {
  const digits = dot.replace(/\D+/g, '');
  if (!digits) return null;
  const today = officeDay();
  const since = new Date(Date.parse(today) - SUSPENSION_LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');

  // The census (phone, email, address) is asked for on its own and allowed to
  // fail alone: losing it costs the contact details, and the insurer and
  // policy are still worth having. The other three stay all-or-nothing,
  // because the panel reads an empty policy list as "nothing on file" and a
  // timed-out query must not say that.
  const censusRows = rows(DATASET.census, `dot_number='${digits}'`, undefined, CENSUS_TIMEOUT_MS).catch(() => [] as Row[]);
  const granted = authorityGranted(digits);

  try {
    const [census, insurance, history, suspensions, legacy, grantedDay] = await Promise.all([
      censusRows,
      rows(DATASET.insurance, `usdot_number='${digits}'`),
      rows(DATASET.history, `usdot_number='${digits}'`),
      rows(DATASET.suspensions, `usdot_number='${digits}' AND order1_effective_date >= '${since}'`),
      // The old file writes a DOT as eight digits, zero-padded: 02783753.
      rows(DATASET.legacy, `dot_number='${digits.padStart(8, '0')}'`),
      granted,
    ]);

    const c: Row = census[0] ?? {};
    const country = str(c.phy_country).toUpperCase() || 'US';
    const live = mergeLegacy(currentPolicies(insurance, history, today), legacy, onFile, today);
    const policies = live.map((l) => l.policy);
    const pendingCancellations = pendingOf(live);

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
      authorityGranted: grantedDay,
      dotAdded: isoDay(c.add_date),
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
