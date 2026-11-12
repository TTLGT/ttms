import type { Address } from './order';

/**
 * The countries a pickup, delivery or party address can be in (2026-11-12).
 *
 * Until then every address was American: the form offered the 50 states and
 * nothing else, and `country` was always 'US'. The office asked for Canada,
 * Mexico and Central America — Guatemala, El Salvador, Honduras, Costa Rica,
 * Nicaragua and Panamá. Adding one is an entry here; nothing else lists them.
 *
 * What is stored is unchanged in shape: `country` is the two-letter ISO code,
 * and `state` is
 *
 *  - the two-letter code for the US and Canada — the time zone badge and every
 *    US document read those codes, and Canada's are just as standard;
 *  - the name, as written locally, everywhere else. Mexico's state
 *    abbreviations are not standard ("BC" is also British Columbia), and
 *    Central America writes its departments and provinces out in full.
 *
 * An address with no country, or 'USA', reads as the US (`countryCode()`), so
 * every address saved before this is a US address with nothing to backfill.
 */

export type AddressCountryCode = 'US' | 'CA' | 'MX' | 'GT' | 'SV' | 'HN' | 'CR' | 'NI' | 'PA';

export interface AddressCountry {
  code: AddressCountryCode;
  name: string;
  /** What the second box is called there: State, Province, Department. */
  regionWord: string;
  /** What the postal code is called there. */
  postalWord: string;
  /**
   * Whether an address is incomplete without one. Central America has postal
   * codes on paper, but a dock address there is very rarely written with one,
   * so asking for it would only teach people to wave the warning through.
   */
  postalRequired: boolean;
  /** [stored value, shown name]. */
  regions: readonly (readonly [string, string])[];
}

const named = (names: string[]) => names.map((n) => [n, n] as const);

export const ADDRESS_COUNTRIES: readonly AddressCountry[] = [
  {
    code: 'US', name: 'United States', regionWord: 'State', postalWord: 'ZIP', postalRequired: true,
    regions: [
      'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA',
      'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
      'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
      'VA','WA','WV','WI','WY',
    ].map((c) => [c, c] as const),
  },
  {
    code: 'CA', name: 'Canada', regionWord: 'Province', postalWord: 'Postal code', postalRequired: true,
    regions: [
      ['AB', 'AB – Alberta'], ['BC', 'BC – British Columbia'], ['MB', 'MB – Manitoba'],
      ['NB', 'NB – New Brunswick'], ['NL', 'NL – Newfoundland and Labrador'],
      ['NS', 'NS – Nova Scotia'], ['NT', 'NT – Northwest Territories'], ['NU', 'NU – Nunavut'],
      ['ON', 'ON – Ontario'], ['PE', 'PE – Prince Edward Island'], ['QC', 'QC – Quebec'],
      ['SK', 'SK – Saskatchewan'], ['YT', 'YT – Yukon'],
    ],
  },
  {
    code: 'MX', name: 'Mexico', regionWord: 'State', postalWord: 'Postal code', postalRequired: true,
    regions: named([
      'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua',
      'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato', 'Guerrero',
      'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla',
      'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas',
      'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas',
    ]),
  },
  {
    code: 'GT', name: 'Guatemala', regionWord: 'Department', postalWord: 'Postal code', postalRequired: false,
    regions: named([
      'Alta Verapaz', 'Baja Verapaz', 'Chimaltenango', 'Chiquimula', 'El Progreso', 'Escuintla',
      'Guatemala', 'Huehuetenango', 'Izabal', 'Jalapa', 'Jutiapa', 'Petén', 'Quetzaltenango', 'Quiché',
      'Retalhuleu', 'Sacatepéquez', 'San Marcos', 'Santa Rosa', 'Sololá', 'Suchitepéquez',
      'Totonicapán', 'Zacapa',
    ]),
  },
  {
    code: 'SV', name: 'El Salvador', regionWord: 'Department', postalWord: 'Postal code', postalRequired: false,
    regions: named([
      'Ahuachapán', 'Cabañas', 'Chalatenango', 'Cuscatlán', 'La Libertad', 'La Paz', 'La Unión',
      'Morazán', 'San Miguel', 'San Salvador', 'San Vicente', 'Santa Ana', 'Sonsonate', 'Usulután',
    ]),
  },
  {
    code: 'HN', name: 'Honduras', regionWord: 'Department', postalWord: 'Postal code', postalRequired: false,
    regions: named([
      'Atlántida', 'Choluteca', 'Colón', 'Comayagua', 'Copán', 'Cortés', 'El Paraíso',
      'Francisco Morazán', 'Gracias a Dios', 'Intibucá', 'Islas de la Bahía', 'La Paz', 'Lempira',
      'Ocotepeque', 'Olancho', 'Santa Bárbara', 'Valle', 'Yoro',
    ]),
  },
  {
    code: 'CR', name: 'Costa Rica', regionWord: 'Province', postalWord: 'Postal code', postalRequired: false,
    regions: named(['Alajuela', 'Cartago', 'Guanacaste', 'Heredia', 'Limón', 'Puntarenas', 'San José']),
  },
  {
    code: 'NI', name: 'Nicaragua', regionWord: 'Department', postalWord: 'Postal code', postalRequired: false,
    regions: named([
      'Boaco', 'Carazo', 'Chinandega', 'Chontales', 'Costa Caribe Norte', 'Costa Caribe Sur', 'Estelí',
      'Granada', 'Jinotega', 'León', 'Madriz', 'Managua', 'Masaya', 'Matagalpa', 'Nueva Segovia',
      'Río San Juan', 'Rivas',
    ]),
  },
  {
    code: 'PA', name: 'Panamá', regionWord: 'Province', postalWord: 'Postal code', postalRequired: false,
    regions: named([
      'Bocas del Toro', 'Chiriquí', 'Coclé', 'Colón', 'Darién', 'Emberá-Wounaan', 'Guna Yala',
      'Herrera', 'Los Santos', 'Naso Tjër Di', 'Ngäbe-Buglé', 'Panamá', 'Panamá Oeste', 'Veraguas',
    ]),
  },
];

const BY_CODE = new Map(ADDRESS_COUNTRIES.map((c) => [c.code, c]));

/**
 * The stored country code of an address. Blank and 'USA' read as 'US' —
 * every address from before countries existed — and three-letter codes an
 * import might carry are folded to two. Anything else is kept as given.
 */
export function countryCode(raw: string | null | undefined): string {
  const c = String(raw ?? '').trim().toUpperCase();
  if (!c || c === 'USA') return 'US';
  if (c === 'CAN') return 'CA';
  if (c === 'MEX') return 'MX';
  return c.slice(0, 4);
}

/** The catalog entry for an address's country; the US for anything unknown. */
export function countryOf(a: Partial<Address> | null | undefined): AddressCountry {
  return BY_CODE.get(countryCode(a?.country) as AddressCountryCode) ?? ADDRESS_COUNTRIES[0];
}

export function isUsAddress(a: Partial<Address> | null | undefined): boolean {
  return countryCode(a?.country) === 'US';
}

/**
 * The country's name for writing after an address, or '' for the US. A US
 * address reads exactly as it always has, on screen and on paper; only a
 * foreign one says where it is — on a BOL in a carrier's cab "San José" is
 * otherwise California.
 */
export function countrySuffix(a: Partial<Address> | null | undefined): string {
  if (!a || isUsAddress(a)) return '';
  const known = BY_CODE.get(countryCode(a.country) as AddressCountryCode);
  return known ? known.name : countryCode(a.country);
}

/** `line` with the country after it when the address is not in the US. */
export function withCountry(line: string, a: Partial<Address> | null | undefined): string {
  const c = countrySuffix(a);
  return line && c ? `${line}, ${c}` : line;
}

/**
 * Whether the region is stored as a code, and so upper-cased on save. Only
 * the US and Canada: a Mexican or Central American name is stored as typed,
 * or "Sacatepéquez" would come back as "SACATEPÉQUEZ".
 */
export function regionIsCode(country: string | null | undefined): boolean {
  const c = countryCode(country);
  return c === 'US' || c === 'CA';
}
