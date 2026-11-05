/**
 * Which clock a stop on a load runs on, and what it reads right now.
 *
 * The office is in Guatemala, on a fixed UTC−6, and calls facilities in every
 * US time zone. "Is the receiver still open?" is a question about *their*
 * clock, and the answer moves twice a year: from March to November a
 * Chicago dock is an hour ahead of the office, the rest of the year it is on
 * the office's time. Arizona never moves; the Navajo Nation inside it does.
 *
 * So this module only decides the **zone** — an IANA name like
 * `America/Chicago` — and leaves the clock to the browser's own time-zone
 * database through `Intl`. That database is what knows when daylight saving
 * starts and ends, including any future change to the rules; nothing here
 * hard-codes a date or an offset for a US zone.
 *
 * The zone comes from the state, refined by ZIP where a state is split. ZIP
 * boundaries do not follow time-zone lines exactly, so the split states are
 * right for the towns freight actually goes to and can be wrong for a ranch
 * on a county line. The badge says which zone it used, so a wrong guess is
 * visible rather than silent.
 *
 * Pure and browser-safe: no Firestore, nothing from the Admin SDK.
 */

import type { Address } from '@/types/order';
import { OFFICE_UTC_OFFSET_MINUTES } from '@/types/attendance';

const ET = 'America/New_York';
const CT = 'America/Chicago';
const MT = 'America/Denver';
const PT = 'America/Los_Angeles';
const BOISE = 'America/Boise'; // Mountain, with DST — southern Idaho and Malheur County, OR
const PHOENIX = 'America/Phoenix'; // Mountain, never moves

/** Where a whole state (or province) is on one clock. Split ones are refined below. */
const STATE_ZONE: Record<string, string> = {
  AL: CT, AK: 'America/Anchorage', AZ: PHOENIX, AR: CT, CA: PT, CO: MT, CT: ET,
  DE: ET, DC: ET, FL: ET, GA: ET, HI: 'Pacific/Honolulu', ID: BOISE, IL: CT,
  IN: 'America/Indiana/Indianapolis', IA: CT, KS: CT, KY: ET, LA: CT, ME: ET,
  MD: ET, MA: ET, MI: 'America/Detroit', MN: CT, MS: CT, MO: CT, MT: MT, NE: CT,
  NV: PT, NH: ET, NJ: ET, NM: MT, NY: ET, NC: ET, ND: CT, OH: ET, OK: CT, OR: PT,
  PA: ET, RI: ET, SC: ET, SD: CT, TN: CT, TX: CT, UT: MT, VT: ET, VA: ET, WA: PT,
  WV: ET, WI: CT, WY: MT, PR: 'America/Puerto_Rico',
  // Canadian provinces. None of these codes is also a US state, so they can
  // share the table; the order form offers only US states, but imported and
  // hand-edited records sometimes carry one.
  AB: 'America/Edmonton', BC: 'America/Vancouver', MB: 'America/Winnipeg',
  NB: 'America/Moncton', NL: 'America/St_Johns', NS: 'America/Halifax',
  NT: 'America/Yellowknife', NU: 'America/Iqaluit', ON: 'America/Toronto',
  PE: 'America/Halifax', QC: 'America/Toronto', SK: 'America/Regina',
  YT: 'America/Whitehorse',
};

/**
 * Split states. `prefixes` are the first three digits of a ZIP; `zips` are
 * single towns that sit on the other side of the line from their prefix.
 * A five-digit match wins over a prefix, a prefix over the state.
 */
const SPLITS: Record<string, { prefixes?: Record<string, string>; zips?: Record<string, string> }> = {
  // The panhandle west of the Apalachicola River. Port St. Joe is Eastern.
  FL: { prefixes: { '324': CT, '325': CT }, zips: { '32456': ET } },
  // Gary/Hammond/Michigan City in the north-west, Evansville in the south-west.
  IN: { prefixes: { '463': CT, '464': CT, '476': CT, '477': CT } },
  // Western Kentucky, plus the Lake Cumberland towns on the Central side.
  KY: {
    prefixes: { '420': CT, '421': CT, '422': CT, '423': CT, '424': CT },
    zips: { '42728': CT, '42642': CT, '42629': CT, '42717': CT, '42602': CT, '42754': CT, '42726': CT, '42712': CT },
  },
  // East Tennessee — Chattanooga, Knoxville, the Tri-Cities — except the
  // Sequatchie Valley and the plateau counties, which are Central.
  TN: {
    prefixes: { '373': ET, '374': ET, '376': ET, '377': ET, '378': ET, '379': ET },
    zips: {
      '37347': CT, '37327': CT, '37387': CT, '37367': CT, '37380': CT, '37397': CT,
      '37305': CT, '37313': CT, '37339': CT, '37356': CT, '37365': CT,
    },
  },
  // The four Upper Peninsula counties on the Wisconsin line.
  MI: {
    zips: Object.fromEntries([
      '49911', '49938', '49947', '49959', '49968', '49969',          // Gogebic
      '49902', '49903', '49915', '49920', '49927', '49935', '49964',  // Iron
      '49801', '49802', '49831', '49834', '49852', '49870', '49876', '49881', '49892', // Dickinson
      '49812', '49821', '49847', '49848', '49858', '49863', '49873', '49874', '49886', '49887', '49893', '49896', // Menominee
    ].map((z) => [z, CT])),
  },
  ND: { prefixes: { '586': MT } }, // Dickinson and the south-west
  SD: { prefixes: { '577': MT }, zips: { '57638': MT, '57620': MT, '57626': MT } }, // west of the river
  NE: {
    prefixes: { '693': MT }, // Scottsbluff, Alliance
    zips: Object.fromEntries([
      '69153', '69155', '69162', '69154', '69156', '69133', '69145', '69128',
      '69149', '69131', '69125', '69147', '69148', '69122', '69146', '69127',
      '69129', '69141', '69140',
    ].map((z) => [z, MT])),
  },
  KS: {
    zips: Object.fromEntries(['67735', '67741', '67733', '67758', '67761', '67762', '67879', '67878', '67836']
      .map((z) => [z, MT])),
  },
  TX: { prefixes: { '798': MT, '799': MT, '885': MT } }, // El Paso and Hudspeth
  OR: { prefixes: { '979': BOISE } }, // Malheur County — Ontario, Nyssa, Vale
  ID: { prefixes: { '835': PT, '838': PT } }, // the panhandle — Lewiston, Coeur d'Alene
  NV: { zips: { '89883': MT, '89825': MT } }, // West Wendover, Jackpot
  AK: { zips: { '99546': 'America/Adak', '99547': 'America/Adak' } },
  // Arizona does not observe daylight saving; the Navajo Nation does.
  AZ: {
    zips: Object.fromEntries([
      '86033', '86044', '86045', '86054', '86503', '86504', '86505', '86506', '86507',
      '86508', '86510', '86511', '86514', '86515', '86520', '86535', '86538', '86540',
      '86544', '86545', '86547', '86556',
    ].map((z) => [z, MT])),
  },
};

/** The IANA zone a stop is in, or null when the address does not say enough. */
export function timeZoneForAddress(address: Partial<Address> | null | undefined): string | null {
  if (!address) return null;
  const country = (address.country ?? 'US').trim().toUpperCase();
  // Mexico's state abbreviations are not standard and "BC" would read as
  // British Columbia, so a Mexican stop gets no badge rather than a wrong one.
  if (country && !['US', 'USA', 'CA', 'CAN', ''].includes(country)) return null;

  const state = (address.state ?? '').trim().toUpperCase();
  const zip = (address.zip ?? '').trim().slice(0, 5);
  const split = SPLITS[state];
  if (split && /^\d{5}$/.test(zip)) {
    const exact = split.zips?.[zip];
    if (exact) return exact;
    const byPrefix = split.prefixes?.[zip.slice(0, 3)];
    if (byPrefix) return byPrefix;
  }
  return STATE_ZONE[state] ?? null;
}

// ── Reading the clock ────────────────────────────────────────────────────────

/** Minutes east of UTC that `zone` is at `at` — negative for the Americas. */
export function zoneOffsetMinutes(zone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/**
 * Whether `zone` is on daylight saving at `at`, or null for a zone that has
 * none (Arizona, Hawaii, Saskatchewan, Puerto Rico). Worked out as "ahead of
 * its own winter", which is true north and south of the equator alike.
 */
export function isDaylightSaving(zone: string, at: Date): boolean | null {
  const y = at.getUTCFullYear();
  const jan = zoneOffsetMinutes(zone, new Date(Date.UTC(y, 0, 1)));
  const jul = zoneOffsetMinutes(zone, new Date(Date.UTC(y, 6, 1)));
  if (jan === jul) return null;
  return zoneOffsetMinutes(zone, at) > Math.min(jan, jul);
}

/** "CST", "CDT", "MST" — or "UTC−3:30" where the browser has no letters for it. */
export function zoneAbbreviation(zone: string, at: Date): string {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' })
    .formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? '';
  if (name && !name.startsWith('GMT') && !name.startsWith('UTC')) return name;
  const off = zoneOffsetMinutes(zone, at);
  const sign = off < 0 ? '−' : '+';
  const h = Math.floor(Math.abs(off) / 60);
  const m = Math.abs(off) % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

const ZONE_NAMES: Record<string, string> = {
  'America/New_York': 'Eastern Time', 'America/Detroit': 'Eastern Time',
  'America/Indiana/Indianapolis': 'Eastern Time', 'America/Toronto': 'Eastern Time',
  'America/Iqaluit': 'Eastern Time',
  'America/Chicago': 'Central Time', 'America/Winnipeg': 'Central Time',
  'America/Regina': 'Central Time (Saskatchewan)',
  'America/Denver': 'Mountain Time', 'America/Boise': 'Mountain Time',
  'America/Edmonton': 'Mountain Time', 'America/Yellowknife': 'Mountain Time',
  'America/Phoenix': 'Arizona Time',
  'America/Los_Angeles': 'Pacific Time', 'America/Vancouver': 'Pacific Time',
  'America/Whitehorse': 'Yukon Time',
  'America/Anchorage': 'Alaska Time', 'America/Adak': 'Hawaii–Aleutian Time',
  'Pacific/Honolulu': 'Hawaii Time',
  'America/Halifax': 'Atlantic Time', 'America/Moncton': 'Atlantic Time',
  'America/Puerto_Rico': 'Atlantic Time',
  'America/St_Johns': 'Newfoundland Time',
};

export function zoneName(zone: string): string {
  return ZONE_NAMES[zone] ?? zone.replace(/^.*\//, '').replace(/_/g, ' ');
}

/** "Same time as the office", "1 hr ahead of the office", "2 hr 30 min behind the office". */
export function versusOffice(zone: string, at: Date): string {
  const diff = zoneOffsetMinutes(zone, at) - OFFICE_UTC_OFFSET_MINUTES;
  if (diff === 0) return 'Same time as the office';
  const h = Math.floor(Math.abs(diff) / 60);
  const m = Math.abs(diff) % 60;
  const amount = [h ? `${h} hr` : '', m ? `${m} min` : ''].filter(Boolean).join(' ');
  return `${amount} ${diff > 0 ? 'ahead of' : 'behind'} the office`;
}

/** "2:14 PM" on the stop's own clock. */
export function localTime(zone: string, at: Date): string {
  return at.toLocaleTimeString('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' });
}
