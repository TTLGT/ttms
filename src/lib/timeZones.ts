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
import { countryCode } from '@/types/addressCountry';
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

// ── Mexico ───────────────────────────────────────────────────────────────────
//
// Mexico stopped daylight saving in October 2022 everywhere except a strip
// along the US border, which still moves with the US so that twin cities —
// Juárez and El Paso, Matamoros and Brownsville — keep one clock. So a
// Mexican stop is placed by its state and then, in the border states, by its
// city. States are stored by name (see addressCountry.ts), which is what
// makes this possible: the old two-letter codes clashed with Canada's.
//
// Like the US splits, this is right for the towns freight goes to. Border
// towns are matched on the city as typed, so a ranch outside Reynosa typed as
// its ejido reads as the rest of Tamaulipas. The badge names the zone it
// used, so a wrong guess shows.

const MX_CENTRO = 'America/Mexico_City';      // UTC−6 all year — most of the country
const MX_PACIFICO = 'America/Mazatlan';       // UTC−7 all year
const MX_SONORA = 'America/Hermosillo';       // UTC−7 all year (never had DST)
const MX_SURESTE = 'America/Cancun';          // UTC−5 all year
const MX_NOROESTE = 'America/Tijuana';        // US Pacific time, with US DST
const MX_BORDER_CT = 'America/Matamoros';     // US Central time, with US DST
const MX_BORDER_MT = 'America/Ciudad_Juarez'; // US Mountain time, with US DST
const MX_OJINAGA = 'America/Ojinaga';         // US Central time, with US DST

/** Keyed by the state's name as stored, accents and case folded (placeKey()). */
const MX_STATE_ZONE: Record<string, string> = {
  'aguascalientes': MX_CENTRO, 'baja california': MX_NOROESTE, 'baja california sur': MX_PACIFICO,
  'campeche': MX_CENTRO, 'chiapas': MX_CENTRO, 'chihuahua': 'America/Chihuahua',
  'ciudad de mexico': MX_CENTRO, 'coahuila': MX_CENTRO, 'colima': MX_CENTRO, 'durango': MX_CENTRO,
  'estado de mexico': MX_CENTRO, 'guanajuato': MX_CENTRO, 'guerrero': MX_CENTRO, 'hidalgo': MX_CENTRO,
  'jalisco': MX_CENTRO, 'michoacan': MX_CENTRO, 'morelos': MX_CENTRO, 'nayarit': MX_PACIFICO,
  'nuevo leon': MX_CENTRO, 'oaxaca': MX_CENTRO, 'puebla': MX_CENTRO, 'queretaro': MX_CENTRO,
  'quintana roo': MX_SURESTE, 'san luis potosi': MX_CENTRO, 'sinaloa': MX_PACIFICO,
  'sonora': MX_SONORA, 'tabasco': MX_CENTRO, 'tamaulipas': MX_CENTRO, 'tlaxcala': MX_CENTRO,
  'veracruz': MX_CENTRO, 'yucatan': MX_CENTRO, 'zacatecas': MX_CENTRO,
};

const each = (cities: string[], zone: string) => Object.fromEntries(cities.map((c) => [c, zone]));

/**
 * Cities on the other side of their state's line, by state. The border lists
 * are the municipalities the 2022 law kept on US daylight saving, each under
 * its seat and the names it is commonly typed as.
 */
const MX_CITY_ZONE: Record<string, Record<string, string>> = {
  'chihuahua': {
    ...each(['ciudad juarez', 'juarez', 'cd juarez', 'ascension', 'janos', 'guadalupe',
      'praxedis g guerrero', 'praxedis guerrero', 'el porvenir'], MX_BORDER_MT),
    ...each(['ojinaga', 'manuel benavides', 'coyame', 'coyame del sotol'], MX_OJINAGA),
  },
  'coahuila': each(['piedras negras', 'ciudad acuna', 'acuna', 'cd acuna', 'jimenez', 'guerrero',
    'hidalgo', 'ocampo', 'zaragoza', 'nava', 'allende', 'morelos', 'villa union'], MX_BORDER_CT),
  'nuevo leon': each(['anahuac', 'colombia'], MX_BORDER_CT),
  'tamaulipas': each(['matamoros', 'reynosa', 'nuevo laredo', 'rio bravo', 'valle hermoso',
    'miguel aleman', 'ciudad miguel aleman', 'camargo', 'ciudad camargo', 'gustavo diaz ordaz',
    'ciudad gustavo diaz ordaz', 'diaz ordaz', 'mier', 'nueva ciudad guerrero', 'guerrero'], MX_BORDER_CT),
  // Bahía de Banderas, the Nayarit side of Puerto Vallarta, keeps Vallarta's
  // clock rather than the rest of Nayarit's.
  'nayarit': each(['bahia de banderas', 'nuevo vallarta', 'bucerias', 'valle de banderas',
    'san jose del valle', 'la cruz de huanacaxtle', 'punta de mita', 'punta mita', 'sayulita',
    'mezcales', 'jarretaderas', 'las jarretaderas'], MX_CENTRO),
};

/** "Ciudad Juárez" → "ciudad juarez": accents, case, dots and spare spaces folded. */
function placeKey(text: string | null | undefined): string {
  return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
}

function mexicoZone(address: Partial<Address>): string | null {
  const state = placeKey(address.state);
  return MX_CITY_ZONE[state]?.[placeKey(address.city)] ?? MX_STATE_ZONE[state] ?? null;
}

/**
 * Zones new enough (2022) that an out-of-date browser may not know them, each
 * with an older zone on the same clock. Intl throws on a zone it has never
 * heard of, which would take the whole badge down with it.
 */
const ZONE_FALLBACK: Record<string, string> = {
  [MX_BORDER_MT]: 'America/Denver',
  [MX_OJINAGA]: 'America/Chicago',
};

function usableZone(zone: string): string {
  const fallback = ZONE_FALLBACK[zone];
  if (!fallback) return zone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return fallback;
  }
}

const COUNTRY_ZONE: Record<string, string> = {
  GT: 'America/Guatemala', SV: 'America/El_Salvador', HN: 'America/Tegucigalpa',
  CR: 'America/Costa_Rica', NI: 'America/Managua', PA: 'America/Panama',
};

/** The IANA zone a stop is in, or null when the address does not say enough. */
export function timeZoneForAddress(address: Partial<Address> | null | undefined): string | null {
  if (!address) return null;
  const country = countryCode(address.country);
  // Central America is one zone per country, none of them with daylight
  // saving, so the country alone answers it.
  if (COUNTRY_ZONE[country]) return COUNTRY_ZONE[country];
  if (country === 'MX') {
    const zone = mexicoZone(address);
    return zone ? usableZone(zone) : null;
  }
  if (country !== 'US' && country !== 'CA') return null;

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
  // Named for the country rather than the city the zone is filed under, so
  // a Honduran stop does not read "Tegucigalpa" when it is in San Pedro Sula.
  'America/Guatemala': 'Guatemala time', 'America/El_Salvador': 'El Salvador time',
  'America/Tegucigalpa': 'Honduras time', 'America/Costa_Rica': 'Costa Rica time',
  'America/Managua': 'Nicaragua time', 'America/Panama': 'Panamá time',
  // Mexico by the names its own zones go by (Zona Centro and so on), and the
  // border strip by the US clock it follows.
  'America/Mexico_City': 'Mexico Central time', 'America/Chihuahua': 'Mexico Central time',
  'America/Mazatlan': 'Mexico Pacific time', 'America/Hermosillo': 'Mexico Pacific time (Sonora)',
  'America/Cancun': 'Mexico Southeast time', 'America/Tijuana': 'Pacific Time (Baja California)',
  'America/Matamoros': 'Central Time (Mexican border)', 'America/Ojinaga': 'Central Time (Mexican border)',
  'America/Ciudad_Juarez': 'Mountain Time (Mexican border)',
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
