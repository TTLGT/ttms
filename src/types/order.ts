import type { Timestamp } from 'firebase/firestore';
import type { PhoneRegion } from '@/lib/phone';
import { isUsAddress, withCountry } from './addressCountry';
import type { OrderPartyApproval } from './accessRequest';
import type { ComplexTerms, OrderPaymentTerms } from './paymentMethod';
import type { SignatureRecord } from './signatureRecord';
import type { DriverLocation, DriverProgress } from './driverLink';
import type { PaymentMarks } from './orderPayment';

export type OrderStatus =
  | 'quote'
  | 'booked'
  /**
   * Retired 2026-10-09: no longer a step. Assigning a carrier happens whenever
   * a truck is found, not at any point in the load's order, so a status for
   * it only ever said "a broker remembered to click". Kept in the type
   * because change-log entries and BATS refreshes still carry the string;
   * `scripts/migrate-carrier-assigned.js` moves live orders to `booked`.
   * Nothing writes it any more — see LEGACY_STATUSES.
   */
  | 'carrier_assigned'
  | 'carrier_signed'
  | 'shipper_signed'
  | 'in_transit'
  | 'delivered'
  | 'completed'
  | 'cancelled';

export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export type DimensionUnit = 'in' | 'ft' | 'cm' | 'm';
export type WeightUnit = 'lb' | 'kg';

/**
 * One line of freight on an order. A load is rarely a single uniform object —
 * a broker may move a tractor, its detached bucket and a crate of parts on the
 * same order, each with its own size and weight — so dimensions live per item
 * rather than on the order.
 *
 * Units are stored alongside the numbers instead of being normalised on save:
 * a carrier quoted "8 ft wide" wants to read back "8 ft", not "96 in", and an
 * over-dimension permit is written in the units the broker was quoted in.
 * Conversion happens at the point of calculation — see `toInches`/`toPounds`.
 */
export interface CommodityItem {
  /** Client-generated and stable across edits. Only used as a React key. */
  id: string;
  description: string;
  /** How many identical pieces this line covers. */
  quantity: number;
  length: number;
  width: number;
  height: number;
  dimensionUnit: DimensionUnit;
  /** Weight of ONE piece — the line total is `quantity * weight`. */
  weight: number;
  weightUnit: WeightUnit;
  /**
   * Declared value of the goods on this line, in USD — for ALL its pieces,
   * unlike `weight`. A broker is quoted "the three crates are worth $30k", not
   * a per-crate price, so the line figure is what gets typed in.
   *
   * Optional and null-for-unknown rather than 0: lines written before the
   * field existed have no value on record, and "$0" would claim one.
   */
  value?: number | null;
  /**
   * Which pickup this line is loaded at and which delivery it comes off at,
   * as a position in `orderPickups()` / `orderDeliveries()` — 0 is the first
   * stop, the order's own shipper or consignee.
   *
   * Positions rather than party ids because the same company can be two
   * stops on one load, and a stop typed in with no record has no id at all.
   * The cost is that removing a stop shifts the ones after it, so the forms
   * renumber the lines when that happens (`remapItemStops`).
   *
   * Absent or null means "not said", which is only a question worth asking
   * on a load with more than one stop of that kind — read through
   * `itemStop()`, never the raw field.
   */
  pickupStop?: number | null;
  deliveryStop?: number | null;
  /**
   * The vehicle this line is, when it is one. Per line rather than per order
   * because a car hauler carries several on one load, each with its own VIN.
   *
   * All optional and '' for "not said": lines written before these existed
   * have none, and plenty of freight is not a vehicle at all. Year is a string
   * so a blank box stays blank instead of becoming 0. Read through
   * `vehicleSummary()` / `hasVehicleDetails()` rather than field by field.
   */
  year?: string;
  make?: string;
  model?: string;
  color?: string;
  /** Upper-cased on entry. Not checked for 17 characters — pre-1981 VINs are shorter. */
  vin?: string;
  vehicleType?: string;
  /** Null when nobody said — "operable" must never be assumed for a car that needs a winch. */
  condition?: VehicleCondition | null;
  /**
   * The BOL's handling-unit columns: how many units the pieces travel on and
   * what they are ("6" "PLT"). Separate from `quantity`, which counts pieces —
   * 40 boxes on 2 pallets is quantity 40, handling units 2. Optional and
   * null/'' for "not said"; lines from before 2026-10-14 have neither. Not part
   * of the client's load confirmation, so editing them never holds an SA.
   */
  handlingUnits?: number | null;
  handlingUnitType?: string;
  /** The BOL's H.M. column. Absent means not hazardous, which is what every earlier line meant. */
  hazmat?: boolean;
}

/** Offered as suggestions for `handlingUnitType`; anything else may still be typed. */
export const HANDLING_UNIT_SUGGESTIONS = ['PLT', 'SKID', 'CRATE', 'BOX', 'DRUM', 'BUNDLE', 'ROLL', 'TOTE', 'PIECE'];

export type FreightChargeTerms = 'prepaid' | 'collect' | 'third_party';
export const FREIGHT_CHARGE_TERMS: FreightChargeTerms[] = ['prepaid', 'collect', 'third_party'];
export const FREIGHT_CHARGE_TERMS_LABEL: Record<FreightChargeTerms, string> = {
  prepaid: 'Prepaid', collect: 'Collect', third_party: '3rd Party',
};

/**
 * Who does the work at a dock: loads, unloads or counts. One list for every
 * one of those questions, all four parties offered on each, because the
 * unusual answer is real — a consignee's own crew collecting from the
 * shipper's dock, a lumper hired at a pickup.
 *
 * `trailerLoadedBy` was `shipper` | `driver` until 2026-10-15; this only
 * widened it, so every stored value is still valid.
 */
export type DockParty = 'shipper' | 'consignee' | 'driver' | 'third_party';
export const DOCK_PARTIES: DockParty[] = ['shipper', 'consignee', 'driver', 'third_party'];
/**
 * "3rd party" covers a lumper, a forklift crew, a crane — whoever is hired —
 * and the order says which one in `loadingHelp` / `unloadingHelp`. It read
 * "3rd party (lumper)" until 2026-11-06, which told a carrier the crane was a
 * lumper. Rewording it holds a sent Dispatch Sheet that answered 3rd party
 * (dockWorkLines() is in its fingerprint), which is true: it now says more.
 */
export const DOCK_PARTY_LABEL: Record<DockParty, string> = {
  shipper: 'Shipper', consignee: 'Consignee', driver: 'Driver', third_party: '3rd party',
};

/**
 * Who a 3rd party at the dock is, and who hired them (2026-11-06). Asked
 * only when loading or unloading is done by a 3rd party, and required before
 * the SA goes out (orderReadiness()), because "who pays the crane" is a
 * question nobody should first ask at the dock.
 *
 * Four of the five are additional services already (ACCESSORIALS), and are
 * kept as one fact with them: picking one here ticks that service and sets
 * who arranges it — see reconcileDockHelp(). `other` is a name typed by
 * hand and touches no service; its cost, if any, is a charge added by hand.
 */
export type DockHelpService = 'lumper' | 'forklift' | 'crane' | 'rigging' | 'other';
export const DOCK_HELP_SERVICES: DockHelpService[] = ['lumper', 'forklift', 'crane', 'rigging', 'other'];
export const DOCK_HELP_LABEL: Record<DockHelpService, string> = {
  lumper: 'Lumper', forklift: 'Forklift', crane: 'Crane', rigging: 'Rigging crew', other: 'Other',
};
/** As printed, after "3rd party: " — lower case, mid-sentence. */
const DOCK_HELP_PRINTED: Record<Exclude<DockHelpService, 'other'>, string> = {
  lumper: 'lumper', forklift: 'forklift', crane: 'crane', rigging: 'rigging crew',
};
/** The service each kind of help is, on the order's Additional Services. */
const DOCK_HELP_ACCESSORIAL: Record<Exclude<DockHelpService, 'other'>, Accessorial> = {
  lumper: 'lumper', forklift: 'forklift', crane: 'crane', rigging: 'rigging',
};

export interface DockHelp {
  service: DockHelpService | null;
  /** The name, for `other` only. */
  label?: string;
  /** Who hires them. Null for "not said yet". */
  hiredBy: ServiceArranger | null;
  /**
   * Which provider from the 3rd-party directory (src/types/provider.ts), when
   * one is picked. The name is copied in so the load reads right without a
   * second read, as `carrierName` is beside `carrierId`. Neither is printed
   * on the SA, the Dispatch Sheet or the BOL (dockEndText() leaves them out),
   * so picking one never holds a sent agreement.
   */
  providerId?: string;
  providerName?: string;
}

const MAX_DOCK_HELP_LABEL = 60;

/** The stored shape from whatever JSON came in, or null when it says nothing. */
export function cleanDockHelp(raw: unknown): DockHelp | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const service = typeof r.service === 'string' && (DOCK_HELP_SERVICES as string[]).includes(r.service)
    ? r.service as DockHelpService : null;
  const hiredBy = isServiceArranger(r.hiredBy) ? r.hiredBy : null;
  const label = service === 'other' && typeof r.label === 'string' ? r.label.trim().slice(0, MAX_DOCK_HELP_LABEL) : '';
  const providerId = typeof r.providerId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(r.providerId) ? r.providerId : '';
  const providerName = providerId && typeof r.providerName === 'string' ? r.providerName.trim().slice(0, 120) : '';
  if (!service && !hiredBy && !providerId) return null;
  const provider = providerId ? { providerId, providerName } : {};
  return service === 'other' ? { service, label, hiredBy, ...provider } : { service, hiredBy, ...provider };
}

export type DockEnd = 'pickup' | 'delivery';
type DockFields = Partial<Pick<Order,
  'trailerLoadedBy' | 'trailerUnloadedBy' | 'loadingHelp' | 'unloadingHelp' | 'loadingConditions' | 'unloadingConditions'
  | 'loadingRoles' | 'unloadingRoles'>>;

/**
 * What each party does at a dock several of them share (2026-11-12): one
 * "what will they do" (required) and "what will they bring" (optional) per
 * party picked, plus a box for anything else about the dock.
 *
 * These are the form's answers, not what is printed. The conditions text is
 * built from them by composeDockConditions() and saved beside them, so the
 * SA, the Dispatch Sheet, the BOL and their fingerprints read only
 * `loadingConditions` / `unloadingConditions`, exactly as before. Stored only
 * while two or more parties share the end; null otherwise.
 */
export interface DockRole { does: string; brings: string }
export interface DockRoles { parties: Partial<Record<DockParty, DockRole>>; notes: string }
export const MAX_DOCK_ROLE_DOES = 200;
export const MAX_DOCK_ROLE_BRINGS = 120;
export const MAX_DOCK_ROLE_NOTES = 200;

export function cleanDockRoles(raw: unknown): DockRoles | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { parties?: unknown; notes?: unknown };
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const parties: Partial<Record<DockParty, DockRole>> = {};
  const given = r.parties && typeof r.parties === 'object' ? r.parties as Record<string, unknown> : {};
  for (const p of DOCK_PARTIES) {
    const v = given[p] as { does?: unknown; brings?: unknown } | undefined;
    if (!v || typeof v !== 'object') continue;
    const does = str(v.does, MAX_DOCK_ROLE_DOES);
    const brings = str(v.brings, MAX_DOCK_ROLE_BRINGS);
    if (does || brings) parties[p] = { does, brings };
  }
  const notes = str(r.notes, MAX_DOCK_ROLE_NOTES);
  return Object.keys(parties).length || notes ? { parties, notes } : null;
}

export function dockRolesOf(o: DockFields | null | undefined, end: DockEnd): DockRoles | null {
  return cleanDockRoles(end === 'pickup' ? o?.loadingRoles : o?.unloadingRoles);
}

/** A party as named in its own line: the 3rd party by what it is — "Forklift", "Crane". */
export function dockPartyName(p: DockParty, help: DockHelp | null | undefined): string {
  if (p !== 'third_party' || !help?.service) return DOCK_PARTY_LABEL[p];
  return help.service === 'other' ? (help.label?.trim() || DOCK_PARTY_LABEL[p]) : DOCK_HELP_LABEL[help.service];
}

/**
 * The printed conditions for a shared dock, one line per party in catalog
 * order, then anything else:
 *   Shipper: drives the fire truck onto the trailer. Brings: their own operator.
 *   Driver: guides it on and chains it down. Brings: chains and binders.
 * The single definition — the form shows it and the save stores it.
 */
export function composeDockConditions(by: readonly DockParty[], roles: DockRoles | null, help: DockHelp | null): string {
  const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
  const lines = by.flatMap((p) => {
    const r = roles?.parties[p];
    if (!r?.does && !r?.brings) return [];
    const parts = [r.does ? sentence(r.does) : '', r.brings ? `Brings: ${sentence(r.brings)}` : ''].filter(Boolean);
    return [`${dockPartyName(p, help)}: ${parts.join(' ')}`];
  });
  if (roles?.notes) lines.push(roles.notes);
  return cleanDockConditions(lines.join('\n'));
}

/**
 * The conditions at one end, in the broker's words (2026-11-09): "driver
 * loads with his own straps, dock 4, two-hour window", "lumper paid by the
 * consignee, driver must stay to count". Required once the end is answered,
 * because a bare "Driver" or "3rd party" left both sides guessing at who
 * does what. A stopgap for a structured menu — see the Schema Guide — so it
 * is one free-text box, stored beside the answer rather than inside
 * `loadingHelp`, which is cleared whenever the end stops being a 3rd party.
 */
// 1,000 since 2026-11-12 (was 500): a shared dock's text is a line per
// party, built from boxes capped well under this, plus a note.
export const MAX_DOCK_CONDITIONS = 1000;
export function cleanDockConditions(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, MAX_DOCK_CONDITIONS) : '';
}
export function dockConditionsOf(o: DockFields | null | undefined, end: DockEnd): string {
  return cleanDockConditions(end === 'pickup' ? o?.loadingConditions : o?.unloadingConditions);
}

/**
 * Who loads or unloads, as stored: more than one may share the work
 * (2026-11-12) — the shipper's forklift and the driver's straps, a lumper
 * and the consignee. One answer is still stored as the bare string it always
 * was, and only two or more as an array: every load answered before this,
 * and every one answered with one party since, keeps the exact value its
 * sent SA, Dispatch Sheet and BOL were fingerprinted with, so nothing reads
 * as changed. Never read the field directly — dockEndOf() reads both shapes.
 */
export type DockAnswer = DockParty | DockParty[] | null;

/** Both stored shapes, and anything unknown, as a clean list in catalog order. */
export function dockPartiesOf(raw: unknown): DockParty[] {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return DOCK_PARTIES.filter((p) => list.includes(p));
}

/** The list as it is stored: null, one string, or an array of two or more. */
export function dockAnswerForSave(raw: unknown): DockAnswer {
  const list = dockPartiesOf(raw);
  return list.length === 0 ? null : list.length === 1 ? list[0] : list;
}

/**
 * Shipper and consignee together at one dock is allowed but unusual — they
 * are normally at different ends of the load — so the form asks the broker
 * to make sure. A warning, never a refusal.
 */
export function dockPartiesOdd(parties: readonly DockParty[]): boolean {
  return parties.includes('shipper') && parties.includes('consignee');
}

/** Who works one end of the load, and the help when a 3rd party is among them. */
export function dockEndOf(o: DockFields | null | undefined, end: DockEnd): { by: DockParty[]; help: DockHelp | null } {
  const by = dockPartiesOf(end === 'pickup' ? o?.trailerLoadedBy : o?.trailerUnloadedBy);
  return { by, help: by.includes('third_party') ? cleanDockHelp(end === 'pickup' ? o?.loadingHelp : o?.unloadingHelp) : null };
}

/**
 * What one end still needs before the SA can go out: '' when it is answered,
 * else a short instruction. The single definition — the form, the readiness
 * list and the SA's send route all ask this.
 */
export function dockEndProblem(o: DockFields | null | undefined, end: DockEnd): string {
  const { by, help } = dockEndOf(o, end);
  const where = end === 'pickup' ? 'loads at pickup' : 'unloads at delivery';
  if (!by.length) return `Say who ${where}.`;
  if (by.includes('third_party')) {
    if (!help?.service) return `Say what the 3rd party that ${where} is — a lumper, a forklift, a crane, a rigging crew or something else.`;
    if (help.service === 'other' && !help.label?.trim()) return `Name the 3rd party that ${where}.`;
    if (!help.hiredBy) return `Say who hires the 3rd party that ${where}.`;
  }
  // A shared dock answered through the per-party boxes needs each party's
  // job. One answered before those boxes existed has no roles and falls
  // through to the conditions text, as a single party does.
  if (by.length > 1) {
    const roles = dockRolesOf(o, end);
    const missing = roles
      ? by.find((p) => !roles.parties[p]?.does)
      : dockConditionsOf(o, end) ? undefined : by[0];
    if (missing) return `Say what the ${dockPartyName(missing, help).toLowerCase()} will do at ${end === 'pickup' ? 'pickup' : 'delivery'}.`;
  }
  if (!dockConditionsOf(o, end)) return `Describe the conditions for whoever ${where}.`;
  return '';
}

/**
 * One end as words: "Driver", "3rd party: crane, hired by the consignee", or
 * several joined — "Shipper + Driver", "Consignee + 3rd party: lumper, hired
 * by TTL". What the load card, the SA, the Dispatch Sheet and the BOL all
 * print. One answer reads exactly as it did before several were allowed, so
 * no sent agreement's fingerprint moves.
 */
export function dockEndText(o: DockFields | null | undefined, end: DockEnd): string {
  const { by, help } = dockEndOf(o, end);
  return by.map((p) => {
    if (p !== 'third_party' || !help?.service) return DOCK_PARTY_LABEL[p];
    const what = help.service === 'other' ? (help.label?.trim() || 'other') : DOCK_HELP_PRINTED[help.service];
    return `3rd party: ${what}${help.hiredBy ? `, hired by ${SERVICE_ARRANGER_PRINTED[help.hiredBy]}` : ''}`;
  }).join(' + ');
}

/**
 * The additional services the dock answers stand for, and who arranges each.
 * When both ends use the same service with different hirers there is still
 * one service line, so TTL wins (it is the one with a cost on our side), and
 * otherwise the pickup's answer. The dock lines themselves still say each
 * end exactly.
 */
export function dockLinkedServices(o: DockFields | null | undefined): Partial<Record<Accessorial, ServiceArranger | null>> {
  const out: Partial<Record<Accessorial, ServiceArranger | null>> = {};
  for (const end of ['pickup', 'delivery'] as const) {
    const { help } = dockEndOf(o, end);
    if (!help?.service || help.service === 'other') continue;
    const a = DOCK_HELP_ACCESSORIAL[help.service];
    const was = out[a];
    if (!(a in out) || (!was && help.hiredBy) || help.hiredBy === 'ttl') out[a] = help.hiredBy;
  }
  return out;
}

/** The ticked accessorials with every dock-linked service added, in catalog order. */
export function withDockServices(accessorials: readonly Accessorial[], o: DockFields | null | undefined): Accessorial[] {
  const on = new Set<Accessorial>([...accessorials, ...(Object.keys(dockLinkedServices(o)) as Accessorial[])]);
  return ACCESSORIALS.filter((a) => on.has(a));
}

/**
 * The fields a save must also write so the dock answers and the additional
 * services say the same thing: help cleared at an end no 3rd party works,
 * each linked service ticked and arranged by whoever hires the help, and the
 * Agreed Rate moved by whatever that does to the services' total (a service
 * now hired by the consignee costs the client nothing from us).
 *
 * Run on the order as it will be saved, by both create and update — so a
 * Freight-only save that unticks the crane the delivery needs gets it back,
 * and the forms, which show the same thing, are never the only guard.
 * Returns only the fields to merge into the write.
 */
export function reconcileDockHelp(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const dock = o as DockFields;
  for (const end of ['pickup', 'delivery'] as const) {
    const key = end === 'pickup' ? 'loadingHelp' : 'unloadingHelp';
    const help = dockEndOf(dock, end).help;
    if (key in o || help) out[key] = help;
  }
  const merged = { ...o, ...out } as DockFields;
  const linked = dockLinkedServices(merged);
  const keys = Object.keys(linked) as Accessorial[];
  if (!keys.length) return out;

  const ticked = orderAccessorials(o);
  const accessorials = withDockServices(ticked, merged);
  if (accessorials.length !== ticked.length) out.accessorials = accessorials;

  const charges = cleanServiceCharges(o.serviceCharges);
  let chargesChanged = false;
  for (const a of keys) {
    const by = linked[a] ?? null;
    if (!by) continue;
    const c = charges.find((x) => x.service === a);
    if (c && c.arrangedBy === by) continue;
    if (c) c.arrangedBy = by; else charges.push({ service: a, amount: null, arrangedBy: by });
    chargesChanged = true;
  }
  if (chargesChanged) {
    // Catalog order, then the typed ones — the same as priceTermsForSave().
    const ordered = [
      ...ACCESSORIALS.flatMap((a) => charges.filter((c) => c.service === a)),
      ...charges.filter((c) => c.service === 'other'),
    ];
    const cleaned = cleanServiceCharges(ordered);
    const beforeTotal = serviceChargesTotal(serviceChargeLines({ accessorials: ticked, serviceCharges: o.serviceCharges }));
    const afterTotal = serviceChargesTotal(serviceChargeLines({ accessorials, serviceCharges: cleaned }));
    out.serviceCharges = cleaned;
    if (beforeTotal !== afterTotal) {
      out.agreedRate = Math.max(0, Math.round(((Number(o.agreedRate) || 0) + afterTotal - beforeTotal) * 100) / 100);
    }
  }
  return out;
}

export type TrailerLoadedBy = DockAnswer;
export const TRAILER_LOADED_BY = DOCK_PARTIES;
export const TRAILER_LOADED_BY_LABEL = DOCK_PARTY_LABEL;

/**
 * The pickup count. Keeps the BOL's driver split — pallets "said to contain"
 * against pieces counted — because that difference is what decides who
 * answers for a short count, and it is what the paper form asks. The
 * consignee and a 3rd party were added 2026-10-15; the first three values
 * are unchanged.
 */
export type FreightCountedBy = 'shipper' | 'driver_pallets' | 'driver_pieces' | 'consignee' | 'third_party';
export const FREIGHT_COUNTED_BY: FreightCountedBy[] = ['shipper', 'driver_pallets', 'driver_pieces', 'consignee', 'third_party'];
export const FREIGHT_COUNTED_BY_LABEL: Record<FreightCountedBy, string> = {
  // Spelled out: "pallets said to contain" is the paper form's wording and
  // nobody outside the trade reads it as "the driver did not open them".
  shipper: 'Shipper',
  driver_pallets: 'Driver counts pallets only',
  driver_pieces: 'Driver counts every piece',
  consignee: 'Consignee', third_party: '3rd party',
};

/**
 * Who does what at the docks, as lines for the dispatch sheet — only the
 * questions somebody answered, so a load with none says nothing rather than
 * four rows of dashes. '' for "not said" is never printed.
 */
export function dockWorkLines(o: DockFields & Partial<Pick<Order, 'freightCountedBy' | 'deliveryCountedBy'>>): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = [];
  const add = (label: string, value: string | undefined) => { if (value) lines.push({ label, value }); };
  // The conditions line sits under the answer it qualifies. Only printed when
  // written, so every sheet sent before 2026-11-09 fingerprints as it did.
  add('Loading',             dockEndText(o, 'pickup') || undefined);
  add('Loading conditions',  dockConditionsOf(o, 'pickup') || undefined);
  add('Count at pickup',     o.freightCountedBy  ? FREIGHT_COUNTED_BY_LABEL[o.freightCountedBy] : undefined);
  add('Unloading',           dockEndText(o, 'delivery') || undefined);
  add('Unloading conditions', dockConditionsOf(o, 'delivery') || undefined);
  add('Count at delivery',   o.deliveryCountedBy ? DOCK_PARTY_LABEL[o.deliveryCountedBy] : undefined);
  return lines;
}

/**
 * Who loads and unloads, for the client's SA — the counts are the carrier's
 * and the BOL's business, so only the two answers and their conditions.
 * Empty when nothing is answered, which keeps every SA sent before this
 * fingerprinting as it did; likewise a conditions line only when written.
 */
export function clientDockLines(o: DockFields | null | undefined): { label: string; value: string }[] {
  return ([['Loading at pickup', 'Loading conditions', 'pickup'], ['Unloading at delivery', 'Unloading conditions', 'delivery']] as const)
    .flatMap(([label, condLabel, end]) => [
      { label, value: dockEndText(o, end) },
      { label: condLabel, value: dockConditionsOf(o, end) },
    ])
    .filter((l) => l.value);
}

/**
 * Accessorial services: equipment and arrangements a load needs beyond a
 * truck and a driver. A fixed list rather than free text so the BOL, the SA
 * and the Dispatch Sheet all print the same words, and so the SA review can
 * see what was asked for. Anything not on it goes in the special instructions.
 *
 * The keys are stored on orders. Adding one is free; renaming or removing
 * one is a migration — an unknown key is dropped by orderAccessorials(), so
 * it would quietly vanish from every document.
 */
export const ACCESSORIALS = [
  'ramps', 'winch', 'liftgate', 'pallet_jack', 'tarps', 'straps', 'chains',
  'blankets', 'driver_assist', 'inside_delivery', 'residential', 'appointment',
  'team_drivers', 'pilot_car', 'oversize_permit', 'hazmat', 'twic',
  // Services somebody is paid for (2026-11-04) — see PAID_SERVICES. Appended
  // rather than slotted in beside their neighbours: the catalog order is the
  // printed order, and it is part of the SA's freight fingerprint, so moving
  // an existing key would make every sent SA with two ticked read as changed.
  'towing', 'cleaning', 'mechanic', 'auto_parts', 'scaling', 'forklift', 'crane',
  'rigging', 'storage', 'lumper',
] as const;
export type Accessorial = typeof ACCESSORIALS[number];
export const ACCESSORIAL_LABEL: Record<Accessorial, string> = {
  ramps:           'Ramps',
  winch:           'Winch',
  liftgate:        'Liftgate',
  pallet_jack:     'Pallet jack',
  tarps:           'Tarps',
  straps:          'Straps',
  chains:          'Chains and binders',
  blankets:        'Moving blankets',
  driver_assist:   'Driver assist (load / unload)',
  inside_delivery: 'Inside delivery',
  residential:     'Residential pickup or delivery',
  appointment:     'Appointment required',
  team_drivers:    'Team drivers',
  pilot_car:       'Pilot car / escort',
  oversize_permit: 'Oversize permit',
  hazmat:          'Hazmat endorsement',
  twic:            'TWIC card',
  towing:          'Towing assistance',
  cleaning:        'Cleaning',
  mechanic:        'Mechanic',
  auto_parts:      'Auto parts',
  scaling:         'Scaling (weigh ticket)',
  forklift:        'Forklift',
  crane:           'Crane',
  rigging:         'Rigging',
  storage:         'Storage',
  lumper:          'Lumper (unloading crew)',
};

export function isAccessorial(v: unknown): v is Accessorial {
  return typeof v === 'string' && (ACCESSORIALS as readonly string[]).includes(v);
}

/**
 * The accessorials that are a service somebody is paid for — a crane, a tow,
 * a pilot car — as opposed to equipment the truck brings. Ticking one opens a
 * cost line for it in Price and Terms (`serviceCharges`). A subset of
 * ACCESSORIALS, so it prints on the documents like any other; only the cost
 * is extra. Adding a key here is free; it only decides where the box is drawn.
 */
export const PAID_SERVICES: readonly Accessorial[] = [
  'pilot_car', 'oversize_permit',
  'towing', 'cleaning', 'mechanic', 'auto_parts', 'scaling', 'forklift', 'crane',
  'rigging', 'storage', 'lumper',
];

export function isPaidService(a: Accessorial): boolean {
  return PAID_SERVICES.includes(a);
}

/**
 * Offered for a charge typed by hand — the ones too rare, or too much an
 * after-the-fact event, for a tick box in Freight. Anything else may be typed.
 */
export const OTHER_CHARGE_SUGGESTIONS = [
  'Detention', 'Layover', 'Truck ordered not used (TONU)', 'Re-delivery',
  'Stop-off', 'Fuel delivery', 'Jump start', 'Key replacement', 'Washout',
];

/**
 * One additional service and what the client pays for it (2026-11-04). The
 * Agreed Rate is worked out as carrier pay + broker fee + every one of these
 * (agreedRateFrom() in PriceAndTermsSection), and the client's SA and invoice
 * list them one by one beside Freight Transportation (clientChargeLines()). The
 * carrier's Dispatch Sheet and the BOL print the names only, never the costs.
 *
 * `service` is a PAID_SERVICES key, whose line exists only while that
 * accessorial is ticked (`serviceChargeLines()` filters, because Freight and
 * Price and Terms are saved separately and an untick in one cannot reach the
 * other), or `'other'` for one typed by hand, which carries its own `label`.
 */
export interface ServiceCharge {
  service: Accessorial | 'other';
  label?: string;
  /** Null for "not priced yet" — never 0 for unknown. */
  amount: number | null;
  /** Whose job it is to arrange it. Null or absent for "not said yet". */
  arrangedBy?: ServiceArranger | null;
  /**
   * Who does the work, from the 3rd-party directory (src/types/provider.ts),
   * when one is picked (2026-11-06) — the mechanic, the tow, the pilot car.
   * The name is copied in as `providerName` is on DockHelp, so the load reads
   * right without a second read. Never printed, and never part of any
   * fingerprint: every fingerprint maps a line to its label, amount and
   * arranger, so picking or changing one holds no sent SA or Dispatch Sheet.
   */
  providerId?: string;
  providerName?: string;
}

/**
 * Who arranges an additional service (2026-11-04): the carrier brings or
 * books it, the client does, or we do. Printed beside the service on the
 * client's SA and the carrier's Dispatch Sheet, and part of both
 * fingerprints, because it is a statement of whose job something is.
 */
/*
 * The shipper and the consignee were added 2026-11-06, for the crane or the
 * forklift crew a facility hires itself. Appended, so no stored value moves.
 */
export type ServiceArranger = 'carrier' | 'client' | 'ttl' | 'shipper' | 'consignee';
export const SERVICE_ARRANGERS: ServiceArranger[] = ['ttl', 'client', 'shipper', 'consignee', 'carrier'];
/** On the form. */
export const SERVICE_ARRANGER_LABEL: Record<ServiceArranger, string> = {
  carrier: 'Carrier', client: 'Client', ttl: 'TTL', shipper: 'Shipper', consignee: 'Consignee',
};
/** On the documents, after "arranged by". */
const SERVICE_ARRANGER_PRINTED: Record<ServiceArranger, string> = {
  carrier: 'the carrier', client: 'the client', ttl: 'TTL', shipper: 'the shipper', consignee: 'the consignee',
};

export function isServiceArranger(v: unknown): v is ServiceArranger {
  return typeof v === 'string' && (SERVICE_ARRANGERS as string[]).includes(v);
}

/**
 * Whether a service arranged by this party is one we charge the client
 * nothing for. The client, the shipper and the consignee pay whoever they
 * hire themselves; TTL and the carrier are the two whose cost can be on our
 * bill. The single test — the forms, the save and the SA all ask it.
 */
export function notOurCharge(by: ServiceArranger | null | undefined): boolean {
  return by === 'client' || by === 'shipper' || by === 'consignee';
}

/** Printed in place of a price for a service somebody else arranges. */
export function arrangerNote(by: ServiceArranger): string {
  return by === 'client' ? CLIENT_ARRANGES_NOTE : `Arranged by ${SERVICE_ARRANGER_PRINTED[by]}`;
}

/** Most lines one order keeps; far past any real load, it caps a pasted payload. */
export const MAX_SERVICE_CHARGES = 30;
const MAX_CHARGE_LABEL = 80;

/**
 * The stored shape, from whatever JSON came in: known services once each,
 * typed ones with a name, amounts non-negative to the cent. Shared by the
 * save route and the readers, so neither trusts the other's input.
 */
export function cleanServiceCharges(raw: unknown): ServiceCharge[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ServiceCharge[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const c = r as Record<string, unknown>;
    const n = typeof c.amount === 'number' ? c.amount : NaN;
    let amount = Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
    const arrangedBy = isServiceArranger(c.arrangedBy) ? c.arrangedBy : null;
    // The client (or a facility) arranging it means we charge nothing for it
    // — always, so a figure left in the box from before cannot reach the rate.
    if (notOurCharge(arrangedBy)) amount = 0;
    // Same shape check as cleanDockHelp(): an id is only ever a Firestore id.
    const providerId = typeof c.providerId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(c.providerId) ? c.providerId : '';
    const provider = providerId
      ? { providerId, providerName: typeof c.providerName === 'string' ? c.providerName.trim().slice(0, 120) : '' }
      : {};
    if (c.service === 'other') {
      const label = typeof c.label === 'string' ? c.label.trim().slice(0, MAX_CHARGE_LABEL) : '';
      if (label) out.push({ service: 'other', label, amount, arrangedBy, ...provider });
    } else if (isAccessorial(c.service) && isPaidService(c.service) && !seen.has(c.service)) {
      seen.add(c.service);
      out.push({ service: c.service, amount, arrangedBy, ...provider });
    }
    if (out.length >= MAX_SERVICE_CHARGES) break;
  }
  return out;
}

/** One line as shown: the name to print and the amount. */
export interface ServiceChargeLine {
  service: Accessorial | 'other';
  label: string;
  amount: number | null;
  arrangedBy: ServiceArranger | null;
  /** The provider picked for it, if any. Shown on screen only — see ServiceCharge. */
  providerId: string | null;
  providerName: string | null;
}

/**
 * The charges that count: one line per ticked paid service, in catalog order,
 * with its amount if one was typed, then the typed ones. The single
 * definition — the form, the order card and the total all read this.
 */
export function serviceChargeLines(
  o: { accessorials?: unknown; serviceCharges?: unknown } | null | undefined,
): ServiceChargeLine[] {
  const stored = cleanServiceCharges(o?.serviceCharges);
  const ticked = orderAccessorials(o).filter(isPaidService);
  return [
    ...ticked.map((s) => {
      const c = stored.find((x) => x.service === s);
      return {
        service: s, label: ACCESSORIAL_LABEL[s], amount: c?.amount ?? null, arrangedBy: c?.arrangedBy ?? null,
        providerId: c?.providerId ?? null, providerName: c?.providerName ?? null,
      };
    }),
    ...stored.filter((c) => c.service === 'other')
      .map((c) => ({
        service: 'other' as const, label: c.label ?? '', amount: c.amount, arrangedBy: c.arrangedBy ?? null,
        providerId: c.providerId ?? null, providerName: c.providerName ?? null,
      })),
  ];
}

/** "Crane (arranged by TTL)" — or the bare name while nobody has been chosen. */
export function serviceWithArranger(l: { label: string; arrangedBy: ServiceArranger | null }): string {
  return l.arrangedBy ? `${l.label} (arranged by ${SERVICE_ARRANGER_PRINTED[l.arrangedBy]})` : l.label;
}

/**
 * Every additional service by name with who arranges it, priced or not and
 * typed or ticked — what the carrier's Dispatch Sheet prints. Never costs.
 */
export function arrangedServiceLabels(
  o: { accessorials?: unknown; serviceCharges?: unknown } | null | undefined,
): string[] {
  return serviceChargeLines(o).map(serviceWithArranger);
}

/**
 * Who arranges what, for the SA's and the Dispatch Sheet's fingerprints.
 * Empty while nobody has been chosen for anything — so a link sent before
 * arrangers existed fingerprints exactly as it did and is not held.
 */
export function serviceArrangerKeys(
  o: { accessorials?: unknown; serviceCharges?: unknown } | null | undefined,
): string[] {
  return serviceChargeLines(o).filter((l) => l.arrangedBy)
    .map((l) => `${l.service === 'other' ? `other:${l.label}` : l.service}=${l.arrangedBy}`);
}

/** What the lines add up to, to the cent. 0 when none is priced. */
export function serviceChargesTotal(lines: readonly { amount: number | null }[]): number {
  return Math.round(lines.reduce((sum, l) => sum + (l.amount ?? 0), 0) * 100) / 100;
}

/**
 * Carrier pay and the broker fee, as the client sees them: always one line,
 * never split, on the SA and the invoice alike. The invoice's name for the
 * whole rate before additional services existed, kept so a client reads the
 * same words on both documents.
 *
 * It is part of the SA's rate fingerprint (as a label in `charges`), so
 * rewording it holds every sent SA that has a priced additional service.
 */
export const FREIGHT_TRANSPORTATION_LABEL = 'Freight Transportation';

/**
 * The client's charges as the SA and the invoice print them (2026-11-04):
 * Freight Transportation, then the additional services in order — a priced
 * one named with who arranges it, one the client arranges at $0 with
 * CLIENT_ARRANGES_NOTE where the price would be — adding up to
 * `agreedRate`. Empty when there is neither — the documents then print the
 * rate as the one figure they always have.
 *
 * Freight Transportation is the rate less the services rather than carrier pay +
 * broker fee read separately. On any load saved since the Agreed Rate became
 * their sum those are the same number; on an imported load whose three
 * stored figures never agreed, this is what keeps the printed lines adding
 * up to the printed total. The carrier's pay and our fee are never shown to
 * the client apart — that is the point of the combined line.
 */
export function clientChargeLines(
  o: { agreedRate?: unknown; accessorials?: unknown; serviceCharges?: unknown } | null | undefined,
): ClientChargeLine[] {
  const services = serviceChargeLines(o).filter(inClientBreakdown);
  if (!services.length) return [];
  const rate = Number(o?.agreedRate) || 0;
  const logistics = Math.max(0, Math.round((rate - serviceChargesTotal(services)) * 100) / 100);
  return [
    { label: FREIGHT_TRANSPORTATION_LABEL, amount: logistics },
    ...services.map((l): ClientChargeLine => (l.arrangedBy && notOurCharge(l.arrangedBy)
      // Ours to list, not ours to charge: the words stand where a price would.
      ? { label: l.label, amount: 0, note: arrangerNote(l.arrangedBy) }
      : { label: serviceWithArranger(l), amount: l.amount ?? 0 })),
  ];
}

/** One line of the client's breakdown. `note`, when set, is printed instead of the amount. */
export interface ClientChargeLine { label: string; amount: number; note?: string }

/** Printed in place of a price for a service the client arranges. */
export const CLIENT_ARRANGES_NOTE = 'Arranged by the client';

/**
 * Whether a service has a line in the client's breakdown: it has a price, or
 * the client arranges it (and the line says so). Everything else is named
 * under Freight instead, so each service appears on the SA exactly once.
 */
export function inClientBreakdown(l: ServiceChargeLine): boolean {
  return notOurCharge(l.arrangedBy) || (l.amount != null && l.amount > 0);
}

/**
 * The order's accessorials, known keys only, in catalog order — so every
 * document lists them the same way however they were ticked, and the SA's
 * fingerprint does not move when only the order of ticking did.
 */
export function orderAccessorials(o: { accessorials?: unknown } | null | undefined): Accessorial[] {
  const raw = Array.isArray(o?.accessorials) ? o!.accessorials as unknown[] : [];
  return ACCESSORIALS.filter((a) => raw.includes(a));
}

/**
 * Every label, equipment and services together — for the change log, the
 * review panel and the BOL fingerprint. Documents print the two halves below
 * instead.
 */
export function accessorialLabels(o: { accessorials?: unknown } | null | undefined): string[] {
  return orderAccessorials(o).map((a) => ACCESSORIAL_LABEL[a]);
}

/*
 * The SA, the Dispatch Sheet and the BOL print equipment and paid services
 * as two lines (2026-11-04): under one "Accessorials" heading, a carrier read
 * "Crane" as something the truck had to bring. Only the printing splits —
 * the fingerprints still hash the keys from orderAccessorials(), so the split
 * held no sent link and outdated no BOL.
 */

/** Equipment and arrangements the truck brings — printed as "Accessorials". */
export function equipmentLabels(o: { accessorials?: unknown } | null | undefined): string[] {
  return orderAccessorials(o).filter((a) => !isPaidService(a)).map((a) => ACCESSORIAL_LABEL[a]);
}

/** Paid services — printed as "Additional services" by name; only the client's SA and invoice price them. */
export function serviceLabels(o: { accessorials?: unknown } | null | undefined): string[] {
  return orderAccessorials(o).filter(isPaidService).map((a) => ACCESSORIAL_LABEL[a]);
}

export type VehicleCondition = 'operable' | 'inoperable';
export const VEHICLE_CONDITIONS: VehicleCondition[] = ['operable', 'inoperable'];
export const VEHICLE_CONDITION_LABEL: Record<VehicleCondition, string> = {
  operable: 'Operable',
  inoperable: 'Inoperable',
};

/** Offered as suggestions on the form; anything else may still be typed. */
export const VEHICLE_TYPE_SUGGESTIONS = [
  'Sedan', 'Coupe', 'Convertible', 'Hatchback', 'Wagon', 'SUV', 'Pickup', 'Van',
  'Minivan', 'Motorcycle', 'ATV / UTV', 'Boat', 'RV / Camper', 'Trailer',
  'Box truck', 'Semi truck', 'Bus', 'Heavy equipment', 'Farm equipment',
];

/**
 * What the load moves on (`Order.transportType`), offered on the form;
 * anything else may still be typed. Not to be confused with the list above,
 * which is the vehicle being shipped.
 */
export const TRANSPORT_TYPE_SUGGESTIONS = [
  'Open car carrier', 'Enclosed car carrier', 'Hotshot', 'Flatbed', 'Step deck',
  'RGN / Lowboy', 'Conestoga', 'Dry van', 'Reefer', 'Box truck', 'Power only',
  'Tow truck', 'Container / Drayage',
];

/** True when any vehicle detail was entered on the line. */
export function hasVehicleDetails(item: CommodityItem): boolean {
  return Boolean(
    item.year?.trim() || item.make?.trim() || item.model?.trim() || item.color?.trim() ||
    item.vin?.trim() || item.vehicleType?.trim() || item.condition,
  );
}

/**
 * "2019 Toyota Camry · Silver · Sedan · Inoperable", or '' when the line has
 * no vehicle details. The VIN is left to the caller: on the BOL and the order
 * page it gets its own labelled line, because it is what a driver checks
 * against the dashboard plate and must not be lost in a run of words.
 */
export function vehicleSummary(item: CommodityItem): string {
  const name = [item.year, item.make, item.model].map((v) => v?.trim()).filter(Boolean).join(' ');
  return [
    name,
    item.color?.trim(),
    item.vehicleType?.trim(),
    item.condition ? VEHICLE_CONDITION_LABEL[item.condition] : '',
  ].filter(Boolean).join(' · ');
}

const INCHES_PER: Record<DimensionUnit, number> = { in: 1, ft: 12, cm: 1 / 2.54, m: 100 / 2.54 };
const POUNDS_PER: Record<WeightUnit, number> = { lb: 1, kg: 2.20462262185 };

export const DIMENSION_UNITS: DimensionUnit[] = ['in', 'ft', 'cm', 'm'];
export const WEIGHT_UNITS: WeightUnit[] = ['lb', 'kg'];

export const DIMENSION_UNIT_LABEL: Record<DimensionUnit, string> = {
  in: 'in', ft: 'ft', cm: 'cm', m: 'm',
};
export const WEIGHT_UNIT_LABEL: Record<WeightUnit, string> = { lb: 'lbs', kg: 'kg' };

export function toInches(value: number, unit: DimensionUnit): number {
  return (value || 0) * INCHES_PER[unit];
}

export function toPounds(value: number, unit: WeightUnit): number {
  return (value || 0) * POUNDS_PER[unit];
}

export function convertLength(value: number, from: DimensionUnit, to: DimensionUnit): number {
  return toInches(value, from) / INCHES_PER[to];
}

export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  return toPounds(value, from) / POUNDS_PER[to];
}

/** A fresh blank line for the itemised commodity editor. */
export function blankCommodityItem(): CommodityItem {
  return {
    // crypto.randomUUID is unavailable on http:// origins other than localhost,
    // and this id never leaves the browser, so a cheap random suffix is enough.
    id: `ci_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    description: '',
    quantity: 1,
    length: 0,
    width: 0,
    height: 0,
    dimensionUnit: 'in',
    weight: 0,
    weightUnit: 'lb',
    value: null,
    year: '',
    make: '',
    model: '',
    color: '',
    vin: '',
    vehicleType: '',
    condition: null,
    handlingUnits: null,
    handlingUnitType: '',
    hazmat: false,
  };
}

/** Total weight of one commodity line, in pounds. */
export function itemWeightLb(item: CommodityItem): number {
  return toPounds(item.weight, item.weightUnit) * (item.quantity || 0);
}

/** Cubic feet occupied by one commodity line. */
export function itemVolumeFt3(item: CommodityItem): number {
  const cubicInches =
    toInches(item.length, item.dimensionUnit) *
    toInches(item.width, item.dimensionUnit) *
    toInches(item.height, item.dimensionUnit);
  return (cubicInches / 1728) * (item.quantity || 0);
}

export function totalPieces(items: CommodityItem[]): number {
  return items.reduce((sum, i) => sum + (i.quantity || 0), 0);
}

export function totalWeightLb(items: CommodityItem[]): number {
  return items.reduce((sum, i) => sum + itemWeightLb(i), 0);
}

/**
 * Declared value of the whole load: the sum of the lines that have one, or
 * null when none does — "nobody entered a value" must not read as "$0".
 */
export function totalCommodityValue(items: CommodityItem[]): number | null {
  const valued = items.filter((i) => i.value != null);
  if (!valued.length) return null;
  return Math.round(valued.reduce((sum, i) => sum + (i.value ?? 0), 0) * 100) / 100;
}

/** "48 x 40 x 60 in", or '' when the line carries no dimensions. */
export function formatDimensions(item: CommodityItem): string {
  const { length, width, height } = item;
  if (!length && !width && !height) return '';
  const n = (v: number) => (Number.isInteger(v) ? String(v) : String(Number((v || 0).toFixed(2))));
  return `${n(length)} × ${n(width)} × ${n(height)} ${DIMENSION_UNIT_LABEL[item.dimensionUnit]}`;
}

/**
 * The one-line description written back to the legacy `commodity` field. Order
 * lists, invoices and agreement emails were built against that single string
 * and still read it, so it is kept in sync rather than dropped.
 */
export function commoditySummary(items: CommodityItem[]): string {
  // A vehicle line with no commodity typed is still named by the car itself.
  const named = items
    .map((i) => i.description.trim() || [i.year, i.make, i.model].map((v) => v?.trim()).filter(Boolean).join(' '))
    .filter(Boolean);
  if (!named.length) return '';
  if (named.length === 1) return named[0];
  return `${named[0]} + ${named.length - 1} more`;
}

/**
 * Itemised freight for an order, including orders written before the
 * `commodities` array existed and BATS imports, which carry only a
 * description. Those collapse to a single dimensionless line so every reader —
 * detail page, BOL, invoice — can assume an array.
 */
export function orderCommodityItems(
  order: Partial<Pick<Order, 'commodities' | 'commodity' | 'pieces' | 'weight' | 'commodityValue'>>,
): CommodityItem[] {
  if (order.commodities?.length) return order.commodities;
  const quantity = order.pieces || 0;
  return [{
    ...blankCommodityItem(),
    // Fixed rather than random: this runs on every render of a legacy order,
    // and a key that changed each time would remount the row.
    id: 'legacy',
    description: order.commodity ?? '',
    quantity: quantity || 1,
    // The legacy field held the whole load's weight; dividing it back out
    // keeps the line total identical to what the order has always shown.
    weight: quantity > 1 ? (order.weight ?? 0) / quantity : (order.weight ?? 0),
    value: order.commodityValue ?? null,
  }];
}

/**
 * Every item's dimensions on one line, for places that have room for a string
 * but not a table — the agreement emails and the public signing page.
 */
export function dimensionsSummary(items: CommodityItem[]): string {
  const parts = items
    .map((i) => {
      const dims = formatDimensions(i);
      if (!dims) return '';
      const name = i.description.trim();
      return name ? `${name}: ${dims}` : dims;
    })
    .filter(Boolean);
  return parts.join('; ');
}

/** An address flattened into something Google Maps can geocode. */
/**
 * The number a load is known by — on its header, in every list, and on the
 * BOL, invoice and rate confirmation that go out under it.
 *
 * A load that came from BATS keeps leading with its BATS id. The company
 * worked those loads under that number for years: it is what a carrier has in
 * their file, what a client puts on a remittance, and what a broker types into
 * a search. Handing an eight-year-old load a brand-new number would be
 * technically tidier and practically worse.
 *
 * Loads booked in TTMS lead with their sequence number. So the two
 * conventions run side by side and the split is permanent — but it is a split
 * along a line that already exists, between the old system and this one, and
 * it settles itself as BATS-era loads close out.
 *
 * Every screen and document goes through this function rather than reading
 * `orderNumber` directly, so that rule lives in one place.
 */
export function orderDisplayNumber(
  // Loose rather than Pick<Order, …> because the document routes work from a
  // raw Firestore snapshot, and a helper every outbound BOL and invoice goes
  // through should not need a cast at each call site.
  order: { orderNumber?: string | null; batsId?: string | null },
): string {
  return order.batsId || order.orderNumber || '';
}

/**
 * The load's other number, shown under the display number — never instead of
 * it. Null when the order only ever had one.
 *
 * For a BATS load that is the TTMS sequence number; for a TTMS load that has
 * one, the pre-sequence number it used to carry.
 */
export function orderAltNumber(
  order: { orderNumber?: string | null; batsId?: string | null; previousOrderNumber?: string | null },
): string | null {
  if (order.batsId) return order.orderNumber || null;
  const prev = order.previousOrderNumber;
  return prev && prev !== order.orderNumber ? prev : null;
}

/**
 * Enough to go and ask somebody about a load you cannot open.
 *
 * The Documents screen lists every driver's licence in the company, including
 * the ones on loads the reader has no access to — a licence is checked at
 * pickup and delivery by people who are not the broker on the load. Those rows
 * withhold the shipper and name the owner instead, so the reader has somewhere
 * to go rather than a row they cannot act on.
 *
 * `phone` is the US work number. It is already on `users/{uid}`, which every
 * signed-in user can read, so naming it here exposes nothing new — see
 * MIRRORED_FIELDS in src/lib/userImport.ts. The payroll fields on the
 * allowlist entry are a different matter and must not follow it here.
 */
/**
 * An order's people, as the order screens show them. Built server-side by
 * orderOwnerSummaries() in src/lib/orderOwnersServer.ts.
 */
export interface OrderOwnerSummary {
  /** Who created the load. Null for imported loads, which nobody created in TTMS. */
  createdBy: { uid: string; name: string } | null;
  /** Owners with an account. */
  people: { uid: string; name: string; email: string; photoPath?: string | null }[];
  /** Owning work groups. */
  groups: { id: string; name: string }[];
  /** Owners invited but not signed in yet — held by email. */
  pending: string[];
  /** The rep as BATS named them; grants nothing. '' on anything made in TTMS. */
  batsName: string;
  /** Who sees the load because they own its client. Not owners of the load. */
  viaClient: string[];
  /** The broker the SA and Dispatch Sheet name — `paperworkBrokerUid()`. */
  brokerUid: string | null;
}

/**
 * The broker the SA and the Dispatch Sheet name: the one picked on the
 * order if they still own it, else whoever created it if they still own it,
 * else the first person owning it. Null when no person owns the load (a work
 * group, an invite, or nobody) — the paperwork then names whoever sent it,
 * as it always did.
 *
 * Only owners qualify, so taking somebody off the load takes them off its
 * paperwork too without anything having to clear `brokerUid`.
 */
export function paperworkBrokerUid(
  order: { brokerUid?: string | null; createdBy?: string | null; assignedToUids?: string[] | null },
): string | null {
  const owners = order.assignedToUids ?? [];
  if (order.brokerUid && owners.includes(order.brokerUid)) return order.brokerUid;
  if (order.createdBy && owners.includes(order.createdBy)) return order.createdBy;
  return owners[0] ?? null;
}

export interface OwnerContact {
  /**
   * null when the load is owned by a work group, by somebody invited who has
   * never signed in, or by nobody at all. There is no one account to message
   * in any of those cases, so the row shows the name without a chat link.
   */
  uid: string | null;
  /** A person, a work group, or '' meaning "ask an administrator". */
  name: string;
  phone: string | null;
  extension: string | null;
}

export function addressToQuery(a: Address | null | undefined): string {
  if (!a) return '';
  // The country only for a stop abroad: Google needs it to tell San José,
  // Costa Rica from San José, California, and leaving it off US addresses
  // keeps every lane already in the Google cache keyed exactly as it was.
  return withCountry(
    [a.street, a.city, a.state, a.zip].map((v) => (v ?? '').trim()).filter(Boolean).join(', '), a);
}

/**
 * `estimate` — free, offline, from ZIP centroids (`src/lib/routeDistance.ts`).
 * `routes`   — exact road miles from the Google Routes API, billed per lookup.
 */
export type LaneMilesSource = 'estimate' | 'routes';

/**
 * How a lane distance is phrased everywhere it is shown, hedged according to
 * how it was obtained. Two ZIPs in the same town share a centroid and estimate
 * to zero, which is not a useful thing to print, so anything very short is
 * reported as a floor instead.
 */
export function formatLaneMiles(
  miles: number | null | undefined,
  source: LaneMilesSource | null | undefined,
): string {
  if (miles === null || miles === undefined) return '';
  if (source === 'routes') return `${Math.round(miles).toLocaleString()} mi`;
  if (miles < 10) return 'under 10 mi';
  return `about ${Math.round(miles).toLocaleString()} mi`;
}

/** The caveat that has to travel with the number, or '' when there is none. */
export function laneMilesCaption(source: LaneMilesSource | null | undefined): string {
  if (source === 'routes') return 'driving distance via Google Routes';
  if (source === 'estimate') return 'straight-line estimate, not exact road miles';
  return '';
}

/** The label the number sits under. */
export function laneMilesLabel(source: LaneMilesSource | null | undefined): string {
  return source === 'routes' ? 'Driving distance' : 'Estimated distance';
}

/**
 * When the number was arrived at, in words, given an already-formatted date.
 *
 * Phrased by method because the two mean different things to a reader: a
 * routed figure was *obtained* from Google on that date and has sat unchanged
 * since, while an estimate was *computed* then from the calibration in force
 * at the time. Takes the formatted string rather than the date so the caller
 * keeps using the company date format — see src/lib/dateFormat.ts.
 */
export function laneMilesAtNote(
  source: LaneMilesSource | null | undefined,
  formattedDate: string,
): string {
  if (!formattedDate) return '';
  return source === 'routes' ? `Looked up ${formattedDate}` : `Worked out ${formattedDate}`;
}

/**
 * Whether an address can be placed on the map at all. The distance estimate
 * works off ZIP centroids, so a ZIP is the one part it cannot do without.
 */
export function isRoutableAddress(a: Address | null | undefined): boolean {
  // Abroad there is no ZIP table and often no postal code at all, so a city
  // and region are what Google is given to find it.
  if (a && !isUsAddress(a)) return Boolean(a.city?.trim() && a.state?.trim());
  return Boolean((a?.zip ?? '').trim());
}

/**
 * A Google Maps directions link for the load. Built with the documented Maps
 * URLs API rather than a scraped /maps/dir/ path, so it needs no API key and
 * survives Maps UI changes — it simply opens Maps with the route filled in.
 * Returns '' unless both ends are known, so a half-built link is never saved.
 */
export function buildRouteMapUrl(
  origin: Address | null | undefined,
  destination: Address | null | undefined,
): string {
  return buildTripMapUrl([origin, destination]);
}

/**
 * The same link through every stop, in the order they are driven. Stops with
 * no address yet are left out rather than refusing the whole link, but the two
 * ends still have to be there.
 */
export function buildTripMapUrl(stops: readonly (Address | null | undefined)[]): string {
  const points = stops.map(addressToQuery);
  const from = points[0];
  const to = points[points.length - 1];
  if (points.length < 2 || !from || !to) return '';
  const via = points.slice(1, -1).filter(Boolean);
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}`
    + `&destination=${encodeURIComponent(to)}`
    + (via.length ? `&waypoints=${encodeURIComponent(via.join('|'))}` : '')
    + '&travelmode=driving';
}

// ── Load type ────────────────────────────────────────────────────────────────

/** How the freight moves — Order.loadType. Stored as the key. */
export const LOAD_TYPES = ['ftl', 'partial', 'ltl', 'expedited', 'team', 'power_only', 'drayage'] as const;
export type LoadType = (typeof LOAD_TYPES)[number];
export const LOAD_TYPE_LABEL: Record<LoadType, string> = {
  ftl:        'Full truckload (FTL)',
  partial:    'Partial',
  ltl:        'Less than truckload (LTL)',
  expedited:  'Expedited / hot shot',
  team:       'Team drivers',
  power_only: 'Power only',
  drayage:    'Drayage (port or rail)',
};
export function isLoadType(v: unknown): v is LoadType {
  return (LOAD_TYPES as readonly unknown[]).includes(v);
}

// ── Stops ────────────────────────────────────────────────────────────────────

/**
 * A pickup or delivery beyond the first.
 *
 * The first pickup and the first delivery are still the order's own
 * `shipperId` / `origin` / `pickupDate` and `consigneeId` / `destination` /
 * `deliveryDate`, and the extra ones sit beside them in `extraPickups` and
 * `extraDeliveries`. Done that way, rather than moving every stop into one
 * list, so that every query, index, view, list column, PDF and import that
 * reads those fields keeps working unchanged on every order — the ten thousand
 * imported ones included — with no migration. A load with one of each simply
 * has two empty lists, or none at all.
 *
 * The route is driven in the order shown: every pickup, then every delivery.
 * That is the order the map link and the trip distance follow.
 */
export interface OrderStop {
  /** The party at this stop. Empty only for a stop typed in with no record. */
  partyId: string;
  partyName: string;
  address: Address;
  /** Appointment day (or first day of a window), and its last day. */
  date: Timestamp | null;
  dateEnd: Timestamp | null;
  /**
   * Pickups only: the earliest the freight at this stop is ready, as the
   * client told us (2026-11-11). The first pickup's is the order's own
   * `firstAvailablePickup`, for the same no-migration reason as the rest of
   * the first stop. Optional because every stop saved before this has none,
   * and a delivery never has one.
   */
  firstAvailable?: Timestamp | null;
}

export type StopKind = 'pickup' | 'delivery';

/**
 * How many extra stops of each kind one order may carry. Google Maps takes at
 * most nine stops between the two ends of a directions link, and this keeps
 * the whole trip inside that: 1 + 4 pickups, 1 + 4 deliveries.
 */
export const MAX_EXTRA_STOPS = 4;

type StopFields = Partial<Pick<Order,
  'shipperId' | 'shipperName' | 'origin' | 'pickupDate' | 'pickupDateEnd' | 'firstAvailablePickup'
  | 'consigneeId' | 'consigneeName' | 'destination' | 'deliveryDate' | 'deliveryDateEnd'
  | 'extraPickups' | 'extraDeliveries'>>;

/** Every pickup, first one included, in the order they are made. */
export function orderPickups(order: StopFields): OrderStop[] {
  return [
    {
      partyId:   order.shipperId ?? '',
      partyName: order.shipperName ?? '',
      address:   order.origin ?? { street: '', city: '', state: '', zip: '', country: 'US' },
      date:      order.pickupDate ?? null,
      dateEnd:   order.pickupDateEnd ?? null,
      firstAvailable: order.firstAvailablePickup ?? null,
    },
    ...(order.extraPickups ?? []),
  ];
}

/** Every delivery, first one included, in the order they are made. */
export function orderDeliveries(order: StopFields): OrderStop[] {
  return [
    {
      partyId:   order.consigneeId ?? '',
      partyName: order.consigneeName ?? '',
      address:   order.destination ?? { street: '', city: '', state: '', zip: '', country: 'US' },
      date:      order.deliveryDate ?? null,
      dateEnd:   order.deliveryDateEnd ?? null,
    },
    ...(order.extraDeliveries ?? []),
  ];
}

/** The whole trip as addresses, in driving order — what the map and the mileage follow. */
export function tripAddresses(order: StopFields): Address[] {
  return [...orderPickups(order), ...orderDeliveries(order)].map((s) => s.address);
}

/** How many stops the load makes beyond one pickup and one delivery. */
export function extraStopCount(order: StopFields): number {
  return (order.extraPickups?.length ?? 0) + (order.extraDeliveries?.length ?? 0);
}

/**
 * The parties at the extra stops — see `stopPartyIds` on Order. Only the
 * extras: the first pickup and delivery are already queryable as
 * `shipperId` / `consigneeId`.
 */
export function stopPartyIdsOf(order: StopFields): string[] {
  const ids = [...(order.extraPickups ?? []), ...(order.extraDeliveries ?? [])]
    .map((s) => s.partyId)
    .filter(Boolean);
  return [...new Set(ids)];
}

/**
 * A list of stops as it arrived in a save, made safe to store: a list, at most
 * MAX_EXTRA_STOPS long, each entry carrying exactly the stop's fields. The
 * screens only ever send this shape; the server trims to it anyway because the
 * route takes whatever JSON it is given.
 */
export function cleanStops(value: unknown): OrderStop[] {
  if (!Array.isArray(value)) return [];
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  return value.slice(0, MAX_EXTRA_STOPS).filter((v) => v && typeof v === 'object').map((v) => {
    const s = v as Record<string, unknown>;
    const a = (s.address && typeof s.address === 'object' ? s.address : {}) as Record<string, unknown>;
    return {
      partyId:   text(s.partyId),
      partyName: text(s.partyName).trim(),
      address: {
        street:  text(a.street),
        city:    text(a.city),
        state:   text(a.state),
        zip:     text(a.zip),
        country: text(a.country) || 'US',
      },
      date:    (s.date ?? null) as Timestamp | null,
      dateEnd: (s.dateEnd ?? null) as Timestamp | null,
      // Only written when there is one, so a delivery (and every stop saved
      // before the field existed) keeps exactly the shape it had.
      ...(s.firstAvailable ? { firstAvailable: s.firstAvailable as Timestamp } : {}),
    };
  });
}

/**
 * Where a commodity line is picked up or delivered, as a position among the
 * `count` stops of that kind, or null when it has not been said. A load with
 * one stop of a kind needs no answer: everything goes through it.
 * An index past the end — a stop removed outside the forms — reads as unsaid
 * rather than pointing at whatever now sits in that place.
 */
export function itemStop(item: CommodityItem, kind: StopKind, count: number): number | null {
  if (count <= 1) return 0;
  const i = kind === 'pickup' ? item.pickupStop : item.deliveryStop;
  return typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < count ? i : null;
}

/** "Pickup 2", "Delivery 1" — numbered the way the order screen and the BOL number stops. */
export function stopLabel(kind: StopKind, index: number): string {
  return `${kind === 'pickup' ? 'Pickup' : 'Delivery'} ${index + 1}`;
}

/**
 * Renumber every line's stop of one kind after the list of stops changed.
 * `map` takes a line's old position and gives its new one, or null when its
 * stop is gone — the line then reads as unsaid rather than quietly moving to
 * a different company's dock.
 */
export function remapItemStops(
  items: CommodityItem[],
  kind: StopKind,
  map: (index: number) => number | null,
): CommodityItem[] {
  const key = kind === 'pickup' ? 'pickupStop' : 'deliveryStop';
  return items.map((it) => {
    const i = it[key];
    if (typeof i !== 'number') return it;
    return { ...it, [key]: map(i) };
  });
}

/**
 * "Dallas, TX" for one stop, or every stop of a kind joined up — what the
 * agreement emails, the signing page and the invoice print as From and To.
 */
export function stopPlaces(stops: readonly OrderStop[]): string {
  return stops
    .map((s) => [s.address?.city, s.address?.state].filter(Boolean).join(', '))
    .filter(Boolean)
    .join('; ');
}

/** Longest special instruction a client may add when signing. */
export const MAX_CLIENT_INSTRUCTION = 2000;

/** One client's addition to the special instructions, made as they signed. */
export interface ClientAddedInstruction {
  text: string;
  /** The name they signed with. */
  signerName: string;
  at: Timestamp;
  /** The version of the load confirmation they signed; null on an unversioned link. */
  version: number | null;
}

/** The client's additions, whatever shape an old or hand-edited order stores. */
export function clientAddedInstructionsOf(order: { clientAddedInstructions?: unknown }): ClientAddedInstruction[] {
  const list = order.clientAddedInstructions;
  if (!Array.isArray(list)) return [];
  return list.filter((e): e is ClientAddedInstruction =>
    !!e && typeof e === 'object' && typeof (e as ClientAddedInstruction).text === 'string' && !!(e as ClientAddedInstruction).text.trim());
}

/** See `Order.saRecipient`. */
export interface SaRecipient {
  /** The client it was chosen for. A different client on the load ignores it. */
  clientId: string;
  name: string;
  email: string;
  setByName: string;
  setAt: Timestamp;
}

export interface Order {
  id: string;
  batsId: string | null;
  orderNumber: string;
  /**
   * What this order was called before it was given a sequence number, on the
   * records that predate one — a BATS id, or one of the old random
   * `TTL-2026-4821` numbers.
   *
   * Kept because the previous number is on paperwork already in the world, and
   * because staff spent years looking loads up by it. Optional: an order
   * created after the sequence went in has never had another number.
   */
  previousOrderNumber?: string | null;
  /** Contracting/paying party — signs the transport agreement. */
  clientId: string;
  clientName: string;
  /** Origin party / pickup location — signs the BOL with the driver. */
  shipperId: string;
  shipperName: string;
  /** Destination party / delivery location — receives the load. */
  consigneeId: string;
  consigneeName: string;
  /**
   * Pickups and deliveries after the first — see `OrderStop`. Absent on every
   * order that has only the one of each. Read the whole trip through
   * `orderPickups()` / `orderDeliveries()`, never these alone.
   */
  extraPickups?: OrderStop[];
  extraDeliveries?: OrderStop[];
  /**
   * The parties at the extra stops, so a party's page can find a load it is
   * only the second pickup on — Firestore cannot look inside a list of maps,
   * but it can ask `array-contains` of a list of ids. Worked out on save by
   * src/lib/orderWrites.ts; never sent by the browser.
   */
  stopPartyIds?: string[];
  parentOrderId: string | null;
  status: OrderStatus;
  /**
   * One-line freight description. Derived from `commodities` on save — see
   * `commoditySummary` — and kept because order lists, PDFs and the agreement
   * emails read it directly.
   */
  commodity: string;
  /** Itemised freight. The source of truth for pieces, weight and dimensions. */
  commodities: CommodityItem[];
  /**
   * Declared value of the whole load, in USD — what the freight is worth, not
   * what it is billed at (that is `agreedRate`). Derived from
   * `commodities[].value` on save — see `totalCommodityValue` — and stored so
   * the load's total can be read without adding up the lines, the same as
   * `pieces` and `weight`.
   *
   * Null or absent when no line has a value; never 0 for "unknown".
   */
  commodityValue?: number | null;
  /**
   * What the load needs beyond a truck and a driver — ramps, a winch, a
   * liftgate, tarps (2026-10-15). Keys from ACCESSORIALS, a list and nothing
   * more: no prices, because nothing here bills them. Printed on the BOL, the
   * client's load confirmation (part of its `freight` fingerprint, so a change
   * holds a sent SA for review) and the carrier's Dispatch Sheet. Absent on
   * loads from before it existed — read through `orderAccessorials()`.
   */
  accessorials?: Accessorial[];
  /**
   * Additional services — the crane, the tow, a lumper — and what each costs
   * the client, typed in Price and Terms (2026-11-04). Added into
   * `agreedRate`, and itemised on the client's SA and invoice. Read through
   * `serviceChargeLines()`, never directly: a paid service's line counts only
   * while it is ticked.
   * Absent on every load from before it existed.
   */
  serviceCharges?: ServiceCharge[];
  /**
   * How the client pays us, and how the carrier is paid — each a copy of the
   * option chosen from Settings, fee and all. See `OrderPaymentTerms` for why
   * it is copied rather than looked up. Optional and null when not chosen;
   * every order predating the field has neither.
   */
  clientPayment?: OrderPaymentTerms | null;
  /** BATS's "Carrier Pay Terms". Null while `complexTerms.enabled`. */
  carrierPayment?: OrderPaymentTerms | null;
  /** BATS's "Broker Fee Terms". Null while `complexTerms.enabled`. */
  brokerFeeTerms?: OrderPaymentTerms | null;
  /** Free text, as BATS's "Special Terms" — anything the dropdowns cannot say. */
  specialTerms?: string;
  /** Who pays whom, leg by leg, for a load that is not paid the simple way. */
  complexTerms?: ComplexTerms | null;
  vehicles: string;
  /** Sum of `commodities[].quantity`. Derived — see `totalPieces`. */
  pieces: number;
  /** Total load weight in pounds. Derived — see `totalWeightLb`. */
  weight: number;
  /**
   * The truck or trailer the load moves on — "Open car carrier", "Flatbed".
   * Not to be confused with a freight line's `vehicleType`, which is the
   * vehicle being *shipped*. Required when an order is created (enforced in
   * createOrderAsCaller()), and printed on the SA, the Dispatch Sheet and the
   * BOL. Free text with suggestions (TRANSPORT_TYPE_SUGGESTIONS), because the
   * BATS import brought its own wording and every one of those must stay
   * valid. '' on imported loads BATS left blank and on every load made here
   * before 2026-10-21; orderReadiness() flags those before paperwork goes out.
   */
  transportType: string;
  origin: Address;
  destination: Address;
  /**
   * Google Maps directions link for the route. Auto-built from the two
   * addresses but editable — a broker often needs to pin the exact gate or
   * yard that geocoding a street address does not find.
   */
  routeMapUrl: string;
  /**
   * Distance between the two addresses, in miles. null = not worked out (no
   * ZIP, or lane distances are switched off).
   *
   * Stored rather than recomputed on read, so the figure a broker quoted
   * against does not move under them.
   */
  laneMiles: number | null;
  /**
   * How `laneMiles` was arrived at. Matters because the two methods are not
   * interchangeable — an estimate is roughly ±5% and must never be billed
   * against, while a routed figure is exact. Every surface that shows the
   * number reads this to know what to call it.
   */
  laneMilesSource: LaneMilesSource | null;
  /**
   * When `laneMiles` was worked out — the moment the *number* was produced,
   * not the moment this order was saved.
   *
   * The two are only the same under the estimate. Under Google Routes a lane
   * is answered from `laneDistances` forever after the first lookup, so an
   * order created today can carry a figure Google gave months ago, and an
   * order whose addresses have since been corrected carries one worked out for
   * the old lane. This is the date that tells a broker which, and it is what
   * "Recheck with Google" moves.
   *
   * null on every order written before this field existed, and on any order
   * whose distance came from a cached lane with no date recorded.
   */
  laneMilesAt: Timestamp | null;
  /**
   * The General card's load facts (2026-11-11). All optional: every order
   * from before has none and reads as "not said".
   *
   * `loadType` — how the freight moves (LOAD_TYPES). `quoteDate` — the day the
   * client was quoted, defaulting to the day the order was made; kept apart
   * from `createdAt` because a quote is often given by phone before anybody
   * types it in. `clientBudget` — what the client said they want to spend,
   * for the broker's own negotiating; never printed on anything that leaves
   * the company.
   */
  loadType?: LoadType | '';
  quoteDate?: Timestamp | null;
  clientBudget?: number | null;
  /**
   * Earliest date the freight can be collected, as the client stated it.
   *
   * Deliberately separate from `pickupDate`: this is a constraint the client
   * gives us and it does not move, while `pickupDate` is the date dispatch
   * actually scheduled and is rewritten as the load is worked. Imported from
   * the BATS `FirstAvailablePickup` column, which is why the two must not be
   * collapsed into one field.
   */
  firstAvailablePickup: Timestamp | null;
  /**
   * Scheduled pickup and delivery. When the date is a window rather than a
   * day, these are its **first** day and the `…End` fields below its last.
   */
  pickupDate: Timestamp | null;
  deliveryDate: Timestamp | null;
  /**
   * Last day of the pickup / delivery window, or null (or absent, on every
   * order written before ranges existed) when it is a single day.
   *
   * Added beside the start rather than replacing it with a pair so that every
   * sort, filter, index and alert that reads `pickupDate` keeps working on the
   * start of the window unchanged. Show the pair through `formatDateRange()`.
   */
  pickupDateEnd?: Timestamp | null;
  deliveryDateEnd?: Timestamp | null;
  dispatchedAt: Timestamp | null;
  pickedUpAt: Timestamp | null;
  carrierId: string | null;
  carrierName: string;
  /**
   * The driver record this load was run with, when it was picked from the
   * carrier's drivers rather than typed in. Optional and nullable on purpose:
   * every order written before `drivers` existed has no such field, and a
   * one-off driver typed straight onto a load is still valid — see the note at
   * the top of src/types/driver.ts for why the name and phone below stay on
   * the order regardless.
   */
  driverId?: string | null;
  driverName: string;
  driverPhone: string;
  /**
   * Which country `driverPhone` is in, copied from the driver record along
   * with the number. Absent on every load written before the picker existed —
   * read it through `phoneRegionOf()`, which answers US.
   */
  driverPhoneRegion?: PhoneRegion;
  driverLicenseStoragePath: string | null;
  bolStoragePath: string | null;
  /** What the BOL on file printed — `bolFingerprint()` in src/types/bolRequest.ts. Absent before 2026-10-29. */
  bolFingerprint?: string | null;
  invoiceStoragePath: string | null;
  podStoragePath: string | null;
  /**
   * The load's profile picture — one of its `loadPhotos` — drawn beside its
   * number so loads can be told apart at a glance. Written by the server only
   * (the first picture uploaded, then whatever somebody chooses); absent on
   * every load that has never had a picture. See src/types/loadPhoto.ts.
   */
  coverPhotoId?: string | null;
  /** How many pictures the load has. Kept by the photo routes; absent = none. */
  photoCount?: number;
  /**
   * What the driver has reported from their link, step by step — see
   * src/types/driverLink.ts. Server-kept; absent until the first tap.
   */
  driverProgress?: DriverProgress | null;
  /** The last location the driver sent from their link. */
  driverLocation?: DriverLocation | null;
  /**
   * Whether the client and the driver have been paid, which is what lets the
   * load reach Completed. See src/types/orderPayment.ts. Server-kept.
   */
  paymentMarks?: PaymentMarks | null;
  /**
   * A signed link to the profile picture's thumbnail. Never stored: added to
   * the response by `/api/orders` and `/api/orders/{id}`, since the bucket
   * prefix is closed to the browser.
   */
  coverThumbUrl?: string | null;
  /**
   * Who created, owns and is the broker on this load, with names resolved.
   * Never stored: added to the response by `/api/orders` (list pages) and
   * `/api/orders/{id}`, so a screen can name people without reading every
   * profile in the company. See orderOwnerSummaries().
   */
  owners?: OrderOwnerSummary;
  agreedRate: number;
  brokerFee: number;
  carrierPay: number;
  /**
   * The owning rep as BATS recorded it. Kept as free text for reference and
   * for the ownership timeline; it grants nothing on its own. A name the
   * import could not match to anyone stays here until an admin or dispatcher
   * assigns a real owner.
   */
  assignedTo: string;
  /**
   * Owners of this order. Unlike a party, an order with no owner at all is
   * NOT shared reference data — it is visible only to admin, dispatch and
   * finance. Orders are the commercial record of who is working a load, so the
   * safe default is closed rather than open. See canSeeOrder().
   */
  assignedToUids: string[];
  /** Owning work groups; every member sees the order. */
  assignedToGroupIds: string[];
  /**
   * Owners who exist on the allowlist but have never signed in — see the same
   * field on Party for why ownership has to be held by email until a uid
   * exists to convert it to.
   */
  assignedToEmails: string[];
  /**
   * Owners of this order's client, mirrored from the party.
   *
   * Owning a client grants access to all of its orders, and security rules
   * cannot express that: rules cannot run a query, and a get() on the client
   * party for every order would blow Firestore's 20-document-access limit on
   * any list. So the client's owners are denormalized here and kept in step by
   * syncClientOwners() whenever the party's ownership changes. Do not read
   * these as the order's own owners — they are a cache of someone else's.
   */
  clientOwnerUids: string[];
  clientOwnerGroupIds: string[];
  /**
   * The managed lead source this load is attributed to — a `leadSources`
   * document id, or null when nobody has set one.
   *
   * Only the id is stored. The name is resolved from the list at render time
   * so an admin renaming a source updates every order at once; mirroring the
   * label here would mean rewriting thousands of documents on a rename.
   *
   * Who may change it is narrower than who may edit the order — see
   * canEditSource() in src/lib/accessControl.ts.
   */
  sourceId: string | null;
  /**
   * The source exactly as BATS wrote it. Kept as a fallback label for imported
   * orders whose text matched nothing on the managed list, so the order still
   * shows where it came from. Not written by the app — new orders set
   * `sourceId` instead.
   */
  sourceName: string;
  /**
   * Internal notes — staff only, company-wide. Printed on nothing that leaves
   * the company: no PDF, no email, no signing page. Instructions meant for a
   * carrier or a client go in the two fields below.
   *
   * It used to be printed on all of them (the BOL, the invoice, the quote and
   * both agreements), so a load from before 2026-10-14 may hold text written
   * for a carrier or client here. It is not copied across; whoever next sends
   * that load's paperwork moves it if it still applies.
   */
  notes: string;
  /**
   * Special instructions for the carrier: printed on the dispatch sheet (its
   * signing page and signed PDF) and the BOL. Absent on loads from before it
   * existed — read through `?? ''`.
   */
  carrierInstructions?: string;
  /*
   * What the BOL asks that nothing else on the order answers (2026-10-14),
   * typed in the Bill of Lading card on the order. All optional and absent on
   * earlier loads: an unset one prints as an empty box for a pen, exactly as
   * the paper form did. None of them is on the client's load confirmation, so
   * none of them holds an SA. See BOL_* below for the choices.
   */
  truckNumber?: string;
  trailerNumber?: string;
  freightChargeTerms?: FreightChargeTerms | null;
  /** Who pays the freight when the terms are 3rd party — name and address, free text. */
  thirdPartyBillTo?: string;
  /**
   * One answer stored as the bare string, as it always was; two or more as
   * an array (2026-11-12) — see DockAnswer. Read through dockEndOf().
   */
  trailerLoadedBy?: DockAnswer;
  freightCountedBy?: FreightCountedBy | null;
  /**
   * The delivery end of the same two questions (2026-10-15). Printed on the
   * BOL and snapshotted onto the dispatch sheet with the loading pair — a
   * driver who unloads, or pays a lumper, expects to be told before they
   * accept the load. Not on the client's confirmation, so none holds an SA.
   */
  trailerUnloadedBy?: DockAnswer;
  deliveryCountedBy?: DockParty | null;
  /**
   * The 3rd party at each end — what they are and who hires them — when
   * `trailerLoadedBy` / `trailerUnloadedBy` is `third_party`; null otherwise
   * (2026-11-06). See DockHelp, and reconcileDockHelp() for how it keeps the
   * additional services in step. Printed on the SA, the Dispatch Sheet and
   * the BOL with the answer it belongs to.
   */
  loadingHelp?: DockHelp | null;
  unloadingHelp?: DockHelp | null;
  /**
   * The conditions at each end, free text, required once that end is
   * answered (2026-11-09) before the SA, the Dispatch Sheet or the BOL goes
   * out — see dockEndProblem(). Printed under the answer on all three; in
   * bolFingerprint() too, so changing them raises the regenerate banner.
   */
  loadingConditions?: string;
  unloadingConditions?: string;
  /**
   * Each party's job when several share an end (2026-11-12) — see DockRoles.
   * The conditions above are built from these on save and are what prints.
   */
  loadingRoles?: DockRoles | null;
  unloadingRoles?: DockRoles | null;
  /**
   * Print the full grid of loading, unloading and count boxes on the BOL,
   * answered or not, for a carrier or client who asks for boxes to tick by
   * hand. Off (absent) by default: the BOL then prints only the answers, and
   * leaves the section out when there are none. The Dispatch Sheet always
   * prints only the answers.
   */
  bolShowDockBoxes?: boolean;
  /**
   * Special instructions for the client, written by staff: printed on the
   * quote, the client's load confirmation and its signed PDF. Part of the
   * confirmation's fingerprint, so changing it after sending holds the link
   * for review like any other change the client would see.
   */
  clientInstructions?: string;
  /**
   * What the client typed into "Special instructions" when they signed, one
   * entry per signature, oldest first. Written only by POST /api/sign/[token]
   * (a SIGNATURE_FIELD in orderWrites.ts), and only ever appended to: staff
   * edit `clientInstructions` beside it and can never overwrite these. Shown
   * together with `clientInstructions` as one "client special instructions".
   */
  clientAddedInstructions?: ClientAddedInstruction[];
  /**
   * This load's own terms and conditions for the client's SA and the
   * carrier's Dispatch Sheet, replacing the general ones on this load only.
   * Absent or null: the load follows the general terms. Written only by
   * `/api/orders/{id}/terms`, after an admin's approval when a dispatcher made
   * the change — see `orderTermsOf()` in src/types/agreementTerms.ts.
   */
  clientTerms?: string | null;
  carrierTerms?: string | null;
  /**
   * Who the SA is emailed to on **this load**, in place of the client's main
   * contact — set by admin or dispatch from the SA review (2026-11-06), so a
   * load whose signer is somebody else at the client does not mean editing
   * the client record. Absent or null: the main contact. Kept with the
   * `clientId` it was chosen for and ignored once the load has another
   * client, whose signer it is not. Written only by the sa-request PATCH; see
   * `clientAgreementContact()` in src/lib/orderReadinessServer.ts.
   */
  saRecipient?: SaRecipient | null;
  deliveredAt: Timestamp | null;
  carrierSignedAt: Timestamp | null;
  carrierSignerName: string | null;
  carrierSignerIp: string | null;
  /**
   * The device the e-signature was made on: the raw user agent as evidence,
   * and a readable summary ("Chrome on Windows"). Absent on signatures made
   * before they were recorded. Written only by POST /api/sign/[token].
   */
  carrierSignerUserAgent?: string | null;
  carrierSignerDevice?: string | null;
  /** The job title the signer gave, if any. Absent on signatures before it was asked. */
  carrierSignerTitle?: string;
  /**
   * When the client signed the load confirmation, and who.
   *
   * Named for the shipper for historical reasons only — the document is the
   * client's and is emailed to `clientId`. See STATUS_LABEL.shipper_signed.
   */
  shipperSignedAt: Timestamp | null;
  shipperSignerName: string | null;
  shipperSignerIp: string | null;
  /**
   * The device the e-signature was made on: the raw user agent as evidence,
   * and a readable summary ("Chrome on Windows"). Absent on signatures made
   * before they were recorded. Written only by POST /api/sign/[token].
   */
  shipperSignerUserAgent?: string | null;
  shipperSignerDevice?: string | null;
  /** The job title the signer gave, if any. Absent on signatures before it was asked. */
  shipperSignerTitle?: string;
  /**
   * Which version of the client's signing link was signed. The link is
   * revised in place when the order changes (src/lib/clientAgreements.ts);
   * earlier versions and their signatures are kept on the link's history.
   */
  shipperSignedVersion?: number | null;
  /**
   * Set when somebody dispatched this load without waiting for the client to
   * sign — see the `orders.waiveSignature` permission.
   *
   * A timestamp rather than a flag, and never cleared: this is the record of a
   * commercial risk being taken deliberately, and "who decided, and when" is
   * the whole point of storing it. Written only by
   * POST /api/orders/{id}/waive-signature through the Admin SDK; the rules
   * refuse it from the client so nobody can waive their own way past the gate.
   *
   * It is emphatically **not** a signature. `shipperSignedAt` stays null,
   * nothing is fabricated on the audit trail, and the load confirmation can
   * still be sent and signed afterwards.
   */
  signatureWaivedAt: Timestamp | null;
  signatureWaivedByUid: string | null;
  signatureWaivedByName: string | null;
  signatureWaivedReason: string | null;
  /**
   * The last email telling the client we registered their acceptance from a
   * signed SA uploaded to the load (paper, scan, photo) rather than signed on
   * the link. Written only by POST /api/orders/{id}/signed-sa-confirmation;
   * every send is also on the change log. Absent until the first one.
   */
  paperSaConfirmedAt?: Timestamp | null;
  paperSaConfirmedTo?: string | null;
  paperSaConfirmedByName?: string | null;
  /** The same, for the carrier's hand-signed Carrier Agreement (`signed_ca`). */
  paperCaConfirmedAt?: Timestamp | null;
  paperCaConfirmedTo?: string | null;
  paperCaConfirmedByName?: string | null;
  /**
   * When the client / carrier was last swapped for another one — server-kept,
   * stamped by planPartySwap() in src/lib/orderWrites.ts. Signed paper
   * uploaded before it belongs to the previous party and no longer counts as
   * proof for signing by hand. Absent on a load that never changed.
   */
  clientChangedAt?: Timestamp | null;
  carrierChangedAt?: Timestamp | null;
  /**
   * Mirror of `signatureWaivedAt != null`, and the only reason it exists is
   * that Firestore cannot ask "is this field null or absent" in one query.
   * The dashboard's unsigned-agreements count is an aggregation, so it needs a
   * value present on every order — see scripts/backfill-signature-waived.js.
   *
   * Never test this in application code; call `clientSignatureSatisfied()`.
   */
  signatureWaived: boolean;
  /**
   * A signature recorded from a signed copy uploaded to the load — a BATS
   * e-signed PDF, a scan of paper — once admin or dispatch verified the file.
   * See src/types/signatureRecord.ts.
   *
   * Deliberately **not** `shipperSignedAt` / `carrierSignedAt`: those are the
   * audit trail of a signature made on TTMS's own link, with the IP and device
   * it captured itself. This is what a person read off somebody else's
   * paperwork, and says so wherever it is shown. Written only by
   * POST /api/orders/{id}/files/{fileId}/signature.
   */
  clientSignatureRecord?: SignatureRecord | null;
  carrierSignatureRecord?: SignatureRecord | null;
  /**
   * Mirrors of the two above being set, for the same reason as
   * `signatureWaived`: the dashboard's unsigned count is an aggregation, and
   * Firestore cannot ask "null or absent". Must be on every order —
   * scripts/backfill-record-import.js. Never test these in application code;
   * call `clientSignatureSatisfied()` / `carrierSignatureRecorded()`.
   */
  clientSignatureRecorded?: boolean;
  carrierSignatureRecorded?: boolean;
  /**
   * The load came from an imported list (BATS) and was never processed in
   * TTMS — so its paperwork was not sent, signed or checked here. Shown as
   * the "Record import" label. Set by the importers; switched off (or back
   * on) only by `orders.verifyRecords`, through
   * POST /api/orders/{id}/record-import, which records who and when.
   */
  recordImport?: boolean;
  recordImportChangedAt?: Timestamp | null;
  recordImportChangedByName?: string | null;
  /**
   * Proof of authorization when this order uses a party the creator does not
   * own. Written server-side only — see /api/orders/[orderId]/party-approvals.
   */
  partyApprovals: OrderPartyApproval[];
  createdBy: string;
  /**
   * The broker named on the client's Shipper Agreement and the carrier's
   * Dispatch Sheet — name, phone and email — when the load has more than one
   * person owning it and somebody picked one. Absent or null means the
   * default: whoever created the order. Always read it through
   * `paperworkBrokerUid()`, which falls back when this person is no longer
   * an owner. `brokerName` is the name beside the id, set by the server, for
   * the change log.
   */
  brokerUid?: string | null;
  brokerName?: string;
  /**
   * Fragments this order can be found by — see orderSearchTerms. Derived on
   * save from the number, the party names, the lane and the commodity; never
   * edited by hand and never shown.
   */
  searchTerms?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  quote:            'Quote',
  booked:           'Booked',
  carrier_assigned: 'Carrier Assigned',
  carrier_signed:   'Carrier Signed',
  // Stored as `shipper_signed` and shown as "Client Signed". The document has
  // always been the client's load confirmation — it quotes the agreed rate,
  // which is what the client pays us — and it was only ever addressed to the
  // shipper by mistake. The key is left alone because live orders carry it and
  // renaming a stored status is a migration, not a rename.
  shipper_signed:   'Client Signed',
  in_transit:       'In Transit',
  delivered:        'Delivered',
  completed:        'Completed',
  cancelled:        'Cancelled',
};

/**
 * Every status there is, derived from the labels rather than written out again
 * so the two cannot drift. The order-count endpoint asks for one aggregation
 * per entry, so adding a status here costs a query, not a list to remember.
 */
export const ORDER_STATUSES = Object.keys(STATUS_LABEL) as OrderStatus[];

/**
 * Statuses that may still be read but are never written again. Their labels
 * stay so an old change-log entry still reads as what happened, and the
 * screens fold them into the step they now count as (`displayStatus()`).
 */
export const LEGACY_STATUSES: readonly OrderStatus[] = ['carrier_assigned'];

/** The step a status is drawn as — a retired one shows as where it now belongs. */
export function displayStatus(status: OrderStatus): OrderStatus {
  return status === 'carrier_assigned' ? 'booked' : status;
}

// ── Search ───────────────────────────────────────────────────────────────────

/** Shortest fragment worth storing. One letter would match most of the book. */
const MIN_TERM = 2;
/**
 * Longest fragment stored. Somebody who has typed twelve characters has already
 * narrowed it to a handful; the rest of the word adds entries and finds nothing
 * new, because the query matches a *stored fragment* exactly.
 */
const MAX_TERM = 12;
/** A guard against one absurd commodity description bloating a document. */
const MAX_TERMS = 400;

/**
 * The numbers a load is known by.
 *
 * Kept apart from the text because they are searched differently — see
 * orderSearchTerms. Nobody says "the Morris load" and means the middle of the
 * word, but everybody says "the load ending 1218".
 */
function searchableNumbers(order: Record<string, unknown>): string[] {
  return [
    String(order.orderNumber ?? ''),
    String(order.batsId ?? ''),
    String(order.previousOrderNumber ?? ''),
  ];
}

/**
 * The words a person searches an order by.
 *
 * `shipperName` carries the customer on every imported order — BATS put the
 * CustomerName there — which is why it matters more than `clientName`, a field
 * that is empty on all but one order until the party migration runs.
 */
function searchableText(order: Record<string, unknown>): string[] {
  const address = (a: unknown) => {
    const v = a as { city?: string; state?: string } | null | undefined;
    return [v?.city ?? '', v?.state ?? ''];
  };
  // The extra stops are searched like the first ones: by who and where.
  const stops = [
    ...((order.extraPickups as OrderStop[] | undefined) ?? []),
    ...((order.extraDeliveries as OrderStop[] | undefined) ?? []),
  ].flatMap((s) => [String(s?.partyName ?? ''), ...address(s?.address)]);
  return [
    String(order.shipperName ?? ''),
    String(order.clientName ?? ''),
    String(order.consigneeName ?? ''),
    String(order.carrierName ?? ''),
    String(order.commodity ?? ''),
    ...address(order.origin),
    ...address(order.destination),
    ...stops,
  ];
}

/** Lowercased words, punctuation dropped. "Palm Beach, FL" → ["palm","beach","fl"]. */
export function searchWords(text: string): string[] {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Every prefix of a word, from MIN_TERM up to MAX_TERM characters. */
function prefixesOf(word: string): string[] {
  const out: string[] = [];
  const limit = Math.min(word.length, MAX_TERM);
  // A word shorter than MIN_TERM is still worth storing whole — a two-letter
  // state code is exactly what somebody types to find a lane.
  for (let n = Math.min(MIN_TERM, word.length); n <= limit; n++) out.push(word.slice(0, n));
  return out;
}

/** Every run of characters inside a word, so any segment of it can be typed. */
function segmentsOf(word: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < word.length; i++) {
    for (let n = MIN_TERM; n <= Math.min(word.length - i, MAX_TERM); n++) {
      out.push(word.substr(i, n));
    }
  }
  // A word shorter than MIN_TERM produces nothing above; keep it whole.
  return out.length ? out : [word];
}

/**
 * Every fragment an order should be findable by.
 *
 * Firestore cannot search for text inside a field — there is no equivalent of
 * `LIKE '%morris%'`, and the only reason the carriers list could once do it was
 * that it had already downloaded all eleven thousand of them. So the fragments
 * are worked out on save and stored, and the query becomes `array-contains`,
 * which is a single indexed lookup however large the collection grows.
 *
 * Numbers and words are treated differently, because people say them
 * differently.
 *
 * A load's **numbers** are indexed by every segment, so TTL22001218 answers to
 * "1218" and to "2001" as well as "ttl22". A carrier on the phone says "the
 * load ending 1218" and a broker reads the last four off a rate confirmation;
 * requiring the number from its beginning would fail the way people actually
 * use it. Numbers are short, so this is affordable: it roughly doubles the
 * stored fragments, from about 62 per order to about 124.
 *
 * **Words** are indexed by prefix only — "morr" finds Morris, "orris" does not.
 * Every segment of every name and commodity description would multiply the
 * array for a case nobody types, and unlike a number, a name is something
 * people reliably start at the beginning of.
 *
 * A word is indexed under its own prefixes, so multi-word values are found by
 * any of their words: "Palm Beach" answers to "palm" and to "beach".
 */
export function orderSearchTerms(order: Record<string, unknown>): string[] {
  const terms = new Set<string>();

  const add = (values: string[], fragments: (word: string) => string[]) => {
    for (const value of values) {
      for (const word of searchWords(value)) {
        for (const fragment of fragments(word)) terms.add(fragment);
        if (terms.size > MAX_TERMS) return;
      }
    }
  };

  add(searchableNumbers(order), segmentsOf);
  add(searchableText(order), prefixesOf);

  return [...terms].slice(0, MAX_TERMS);
}

/**
 * What to look up for a typed query.
 *
 * Only the first word is matched. `array-contains-any` would let several words
 * be tried at once but treats them as OR, so "palm beach" would return every
 * load touching either — wider than what was typed, not narrower. The remaining
 * words are filtered from the returned page instead; see the orders list.
 */
export function orderSearchTerm(query: string): string {
  const word = searchWords(query)[0] ?? '';
  return word.slice(0, MAX_TERM);
}

/**
 * How far along the lifecycle each status sits. Used to reconcile an imported
 * BATS status against the one the TMS already holds: the further-along of the
 * two wins, so a refresh can advance an order but never drag it backwards.
 *
 * `cancelled` is deliberately absent — it is a terminal side-exit, not a rung
 * on the ladder, and is handled separately.
 */
export const STATUS_RANK: Record<Exclude<OrderStatus, 'cancelled'>, number> = {
  quote:            0,
  booked:           1,
  // Retired, and ranked with `booked` rather than above it: a carrier on the
  // load is not the client having agreed to anything.
  carrier_assigned: 1,
  // The client signs before the carrier does. A rate confirmation commits us to
  // paying a carrier, so it does not go out until the client has agreed to pay
  // us — see `clientSignatureSatisfied()` below for the one way past that.
  shipper_signed:   3,
  carrier_signed:   4,
  in_transit:       5,
  delivered:        6,
  completed:        7,
};

/**
 * Whether the carrier agreement may go out yet.
 *
 * Either the client signed the load confirmation, or somebody with
 * `orders.waiveSignature` decided to dispatch without it. Both the API guard in
 * /api/orders/{id}/send-agreement and the button on the order screen ask this,
 * so the screen can never offer something the route will refuse.
 */
export function clientSignatureSatisfied(
  order: Pick<Partial<Order>, 'shipperSignedAt' | 'signatureWaivedAt' | 'clientSignatureRecord'>,
): boolean {
  // A signature recorded off a verified signed copy counts: it is the
  // client's acceptance, checked by admin or dispatch against the document.
  return Boolean(order.shipperSignedAt) || Boolean(order.signatureWaivedAt)
    || Boolean(order.clientSignatureRecord);
}

export const STATUS_NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  quote:            'booked',
  // The client's signature is the next thing that happens to a booked load,
  // whether or not a carrier has been found yet. It normally arrives by
  // itself, from the signing link; the button is for a client who signed some
  // other way, and records who pressed it.
  booked:           'shipper_signed',
  carrier_assigned: 'shipper_signed',
  shipper_signed:   'carrier_signed',
  carrier_signed:   'in_transit',
  in_transit:       'delivered',
  delivered:        'completed',
};
