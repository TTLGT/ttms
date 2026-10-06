import type { FmcsaAnswer } from '@/types/fmcsa';

/**
 * FMCSA's QCMobile service — the free, keyed lookup behind the SAFER website.
 *
 * Server-only because of the key. `FMCSA_WEB_KEY` is issued to the company's
 * Login.gov account (it@totaltransportlogistics.us) at
 * mobile.fmcsa.dot.gov/QCDevsite, and travels in the query string, so nothing
 * here may put a request URL into an error message or a log line — that would
 * print the key.
 *
 * Free and unmetered, so unlike Google Routes there is no setting to choose
 * whether it runs. What it does not offer: the insurer, policy number or
 * expiry date (FMCSA publishes those through a separate L&I dataset), and
 * anything about fraud beyond the numbers themselves.
 */

const BASE = 'https://mobile.fmcsa.dot.gov/qc/services/carriers';
const TIMEOUT_MS = 10_000;

/** FMCSA could not be asked, or did not answer. Nothing about the carrier. */
export class FmcsaUnavailableError extends Error {}
/** The key is missing or FMCSA refused it. Something for IT, not the broker. */
export class FmcsaNotConfiguredError extends Error {}

export type FmcsaLookup = FmcsaAnswer;

type Raw = Record<string, unknown>;

async function get(path: string): Promise<unknown> {
  const key = process.env.FMCSA_WEB_KEY?.trim();
  if (!key) throw new FmcsaNotConfiguredError('FMCSA checks are not set up yet: FMCSA_WEB_KEY is missing.');

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}?webKey=${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    // The underlying error can carry the URL, and the URL carries the key.
    throw new FmcsaUnavailableError('FMCSA did not answer. Try again in a few minutes.');
  }

  const body = (await res.json().catch(() => null)) as { content?: unknown } | null;
  // A bad key comes back as a 404 whose content is this sentence, which is
  // otherwise indistinguishable from "no such carrier".
  if (body?.content === 'Webkey not found' || res.status === 401 || res.status === 403) {
    throw new FmcsaNotConfiguredError('FMCSA refused the web key. Check FMCSA_WEB_KEY.');
  }
  if (!res.ok || !body) {
    throw new FmcsaUnavailableError('FMCSA did not answer. Try again in a few minutes.');
  }
  return body.content ?? null;
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

async function docketsFor(dot: string): Promise<string[]> {
  const content = await get(`/${dot}/docket-numbers`);
  if (!Array.isArray(content)) return [];
  return content
    .map((d) => str((d as Raw).docketNumber).replace(/\D+/g, ''))
    .filter(Boolean);
}

function notFound(lookedUpBy: 'dot' | 'mc', query: string): FmcsaLookup {
  return {
    lookedUpBy, query, found: false,
    legalName: '', dbaName: '', dotNumber: '', docketNumbers: [],
    allowedToOperate: '', statusCode: '',
    commonAuthority: '', contractAuthority: '', brokerAuthority: '',
    liabilityOnFile: 0, liabilityRequired: '', liabilityRequiredAmount: 0,
    cargoOnFile: 0, cargoRequired: '', bondOnFile: 0,
    safetyRating: '', safetyRatingDate: '', oosDate: '', mcs150Outdated: '',
    powerUnits: 0, drivers: 0, crashTotal: 0, fatalCrash: 0,
    vehicleInspections: 0, vehicleOosRate: 0, vehicleOosNational: 0,
    driverInspections: 0, driverOosRate: 0, driverOosNational: 0,
    city: '', state: '', street: '', zip: '',
  };
}

/**
 * Look a carrier up by DOT number when we have one, otherwise by MC.
 *
 * DOT first because it is the identity FMCSA keys everything on; an MC is a
 * docket under it. Either way the DOT's docket list is fetched as well, so the
 * caller can tell whether the MC on our record belongs to the same company.
 */
export async function lookupCarrier(dot: string, mc: string): Promise<FmcsaLookup> {
  const lookedUpBy: 'dot' | 'mc' = dot ? 'dot' : 'mc';
  const query = dot || mc;

  let carrier: Raw | null = null;
  if (dot) {
    const content = (await get(`/${dot}`)) as { carrier?: Raw } | null;
    carrier = content?.carrier ?? null;
  } else {
    const content = await get(`/docket-number/${mc}`);
    const first = Array.isArray(content) ? (content[0] as { carrier?: Raw } | undefined) : undefined;
    carrier = first?.carrier ?? null;
  }
  if (!carrier) return notFound(lookedUpBy, query);

  const dotNumber = str(carrier.dotNumber);
  const docketNumbers = dotNumber ? await docketsFor(dotNumber) : [];

  return {
    lookedUpBy, query, found: true,
    legalName: str(carrier.legalName),
    dbaName: str(carrier.dbaName),
    dotNumber,
    docketNumbers,
    allowedToOperate: str(carrier.allowedToOperate),
    statusCode: str(carrier.statusCode),
    commonAuthority: str(carrier.commonAuthorityStatus),
    contractAuthority: str(carrier.contractAuthorityStatus),
    brokerAuthority: str(carrier.brokerAuthorityStatus),
    liabilityOnFile: num(carrier.bipdInsuranceOnFile),
    liabilityRequired: str(carrier.bipdInsuranceRequired),
    liabilityRequiredAmount: num(carrier.bipdRequiredAmount),
    cargoOnFile: num(carrier.cargoInsuranceOnFile),
    cargoRequired: str(carrier.cargoInsuranceRequired),
    bondOnFile: num(carrier.bondInsuranceOnFile),
    safetyRating: str(carrier.safetyRating),
    safetyRatingDate: str(carrier.safetyRatingDate),
    oosDate: str(carrier.oosDate),
    mcs150Outdated: str(carrier.mcs150Outdated),
    powerUnits: num(carrier.totalPowerUnits),
    drivers: num(carrier.totalDrivers),
    crashTotal: num(carrier.crashTotal),
    fatalCrash: num(carrier.fatalCrash),
    vehicleInspections: num(carrier.vehicleInsp),
    vehicleOosRate: num(carrier.vehicleOosRate),
    vehicleOosNational: num(carrier.vehicleOosRateNationalAverage),
    driverInspections: num(carrier.driverInsp),
    driverOosRate: num(carrier.driverOosRate),
    driverOosNational: num(carrier.driverOosRateNationalAverage),
    city: str(carrier.phyCity),
    state: str(carrier.phyState),
    street: str(carrier.phyStreet),
    zip: str(carrier.phyZipcode),
  };
}
