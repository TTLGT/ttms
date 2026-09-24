/**
 * How money moves on a load — the "Price and Terms" block from BATS, which
 * brokers here already think in. Three admin-kept dropdowns:
 *
 * - `client`    — how the client pays us (ACH, card). Not in BATS; added here.
 * - `carrier`   — BATS's "Carrier Pay Terms": how and when the carrier is paid.
 * - `brokerFee` — BATS's "Broker Fee Terms": when our fee is collected.
 *
 * plus free-text special terms and, for loads where the money takes more than
 * one route, BATS's "complex terms" — see `ComplexTerms` below.
 *
 * The lists are an admin's to keep, in Settings → Operations, because the
 * options differ by company and change over time — a new factoring partner, a
 * card processor that raises its rate. They live on `appSettings/general`
 * rather than in a collection of their own: there are a handful of them, every
 * order form reads them, and the settings document is already one read that
 * every signed-in user is allowed.
 *
 * Each option can carry a fee for using it — a card surcharge, a quick-pay
 * discount — and says who pays that fee **by default**. The order can change
 * the payer; it cannot change the fee, which is the company's price for the
 * option rather than something negotiated per load.
 */

export type PaymentSide = 'client' | 'carrier' | 'brokerFee';

export const PAYMENT_SIDES: PaymentSide[] = ['client', 'carrier', 'brokerFee'];

/** `company` is us — the fee is absorbed by TTL rather than passed on. */
export type FeePayer = 'client' | 'carrier' | 'company';

export type FeeType = 'none' | 'flat' | 'percent';

export interface PaymentMethod {
  /** Client-generated, stable across renames. Orders keep it as a link back. */
  id: string;
  name: string;
  feeType: FeeType;
  /** Dollars for `flat`, a percentage (3 = 3%) for `percent`, 0 for `none`. */
  feeAmount: number;
  feePayer: FeePayer;
}

/**
 * What an order records about the option chosen for it.
 *
 * A **copy** of the option as it stood when it was picked, not a reference
 * read back through the settings — the same reasoning as an order keeping its
 * own `driverName`. If an admin raises a card fee from 3% to 3.5% next month,
 * the loads already booked at 3% must still say 3%; and an option removed from
 * the list must not leave its loads with a blank. `methodId` is only a link
 * back, used to preselect the dropdown.
 */
export interface OrderPaymentTerms {
  methodId: string;
  methodName: string;
  feeType: FeeType;
  feeAmount: number;
  /** Starts as the option's default; the broker may change it on the load. */
  feePayer: FeePayer;
}

export const FEE_TYPES: FeeType[] = ['none', 'flat', 'percent'];
export const FEE_PAYERS: FeePayer[] = ['client', 'carrier', 'company'];

export const FEE_TYPE_LABEL: Record<FeeType, string> = {
  none: 'No fee',
  flat: 'Flat ($)',
  percent: 'Percent (%)',
};

export const FEE_PAYER_LABEL: Record<FeePayer, string> = {
  client: 'Client',
  carrier: 'Carrier',
  company: 'TTL (us)',
};

export const PAYMENT_SIDE_LABEL: Record<PaymentSide, string> = {
  client: 'Client Payment Method',
  carrier: 'Carrier Pay Terms',
  brokerFee: 'Broker Fee Terms',
};

/** Where each side's list is kept on `appSettings/general`. */
export const PAYMENT_LIST_KEY = {
  client: 'clientPaymentMethods',
  carrier: 'carrierPaymentMethods',
  brokerFee: 'brokerFeeTermOptions',
} as const satisfies Record<PaymentSide, string>;

/** Enough for any real list, and a stop on a runaway document. */
export const MAX_PAYMENT_METHODS = 50;
const MAX_NAME = 60;

export function blankPaymentMethod(): PaymentMethod {
  return {
    // Same cheap id as blankCommodityItem: crypto.randomUUID is missing on
    // plain-http origins other than localhost.
    id: `pm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    feeType: 'none',
    feeAmount: 0,
    feePayer: 'client',
  };
}

export function termsFromMethod(m: PaymentMethod): OrderPaymentTerms {
  return {
    methodId: m.id,
    methodName: m.name,
    feeType: m.feeType,
    feeAmount: m.feeAmount,
    feePayer: m.feePayer,
  };
}

/**
 * The fee in dollars. A percentage is taken of the money that option moves:
 * the agreed rate for the client's method, the carrier pay for the carrier's
 * terms, the broker fee for the broker fee terms — see `feeBase`.
 * Worked out when shown rather than stored, so correcting the rate after the
 * method was picked cannot leave a stale fee behind.
 */
export function paymentFee(terms: Pick<OrderPaymentTerms, 'feeType' | 'feeAmount'>, base: number): number {
  if (terms.feeType === 'flat') return terms.feeAmount;
  if (terms.feeType === 'percent') return Math.round((base || 0) * terms.feeAmount) / 100;
  return 0;
}

/** "3%", "$25.00" — the fee as the option defines it, before any rate. */
export function feeRateLabel(terms: Pick<OrderPaymentTerms, 'feeType' | 'feeAmount'>): string {
  if (terms.feeType === 'flat') return usd(terms.feeAmount);
  if (terms.feeType === 'percent') return `${terms.feeAmount}%`;
  return 'No fee';
}

export function usd(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

function isFeeType(v: unknown): v is FeeType {
  return v === 'none' || v === 'flat' || v === 'percent';
}

function isFeePayer(v: unknown): v is FeePayer {
  return v === 'client' || v === 'carrier' || v === 'company';
}

/**
 * Checks one list as saved from Settings. Returns the cleaned list, or the
 * sentence to show when something is wrong. Run in the panel before saving and
 * again in `PUT /api/app-settings`, which is where it counts.
 */
export function validatePaymentMethods(raw: unknown): { methods: PaymentMethod[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: 'The list of payment methods is missing.' };
  if (raw.length > MAX_PAYMENT_METHODS) {
    return { error: `Keep it to ${MAX_PAYMENT_METHODS} payment methods or fewer.` };
  }
  const seenNames = new Set<string>();
  const seenIds = new Set<string>();
  const methods: PaymentMethod[] = [];
  for (const entry of raw) {
    const e = (entry ?? {}) as Record<string, unknown>;
    const name = typeof e.name === 'string' ? e.name.trim() : '';
    if (!name) return { error: 'Every payment method needs a name.' };
    if (name.length > MAX_NAME) return { error: `"${name.slice(0, 20)}…" is too long — ${MAX_NAME} characters at most.` };
    // Two options called "Zelle" would be two lines nobody can tell apart in
    // the order form's dropdown.
    const key = name.toLowerCase();
    if (seenNames.has(key)) return { error: `"${name}" is listed twice.` };
    seenNames.add(key);

    const id = typeof e.id === 'string' ? e.id : '';
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || seenIds.has(id)) {
      return { error: `"${name}" has no usable id. Remove it and add it again.` };
    }
    seenIds.add(id);

    if (!isFeeType(e.feeType)) return { error: `"${name}" has an unknown fee type.` };
    if (!isFeePayer(e.feePayer)) return { error: `"${name}" needs somebody to pay its fee.` };
    const amount = e.feeType === 'none' ? 0 : Number(e.feeAmount);
    if (!Number.isFinite(amount) || amount < 0) return { error: `"${name}" has a fee that is not a number.` };
    if (e.feeType === 'percent' && amount > 100) return { error: `"${name}" has a fee over 100%.` };

    methods.push({
      id,
      name,
      feeType: e.feeType,
      feeAmount: Math.round(amount * 100) / 100,
      feePayer: e.feePayer,
    });
  }
  return { methods };
}

/**
 * The stored list, with anything unusable dropped rather than refusing the
 * whole thing — one entry mangled by hand in the Console should not empty
 * every order form's dropdown.
 */
export function readPaymentMethods(raw: unknown): PaymentMethod[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const checked = validatePaymentMethods([entry]);
    return 'methods' in checked ? checked.methods : [];
  });
}

/** What a percentage fee on each side is taken of. */
export function feeBase(side: PaymentSide, money: { agreedRate: number; carrierPay: number; brokerFee: number }): number {
  if (side === 'client') return money.agreedRate || 0;
  if (side === 'carrier') return money.carrierPay || 0;
  return money.brokerFee || 0;
}

/**
 * BATS's "complex payment terms": for a load where the money does not simply
 * go client -> us -> carrier, each leg is written down. Typical shapes:
 *
 * - all through us: client pays us the rate, we pay the carrier;
 * - COD: client pays the carrier everything, the carrier pays us our fee;
 * - deposit: client pays us the fee now and the carrier the rest on delivery.
 *
 * Each amount is null when left blank, which counts as nothing moving on that
 * leg. When complex terms are on they replace the carrier pay terms and the
 * broker fee terms, the same as in BATS.
 */
export interface ComplexTerms {
  enabled: boolean;
  customerPaysBroker: number | null;
  /** A second payment from the client to us — a balance after a deposit. */
  customerPaysBroker2: number | null;
  customerPaysCarrier: number | null;
  carrierPaysBroker: number | null;
  brokerPaysCarrier: number | null;
}

export const COMPLEX_LEGS = [
  'customerPaysBroker', 'customerPaysBroker2', 'customerPaysCarrier', 'carrierPaysBroker', 'brokerPaysCarrier',
] as const;

export type ComplexLeg = typeof COMPLEX_LEGS[number];

export const COMPLEX_LEG_LABEL: Record<ComplexLeg, string> = {
  customerPaysBroker:  'Customer Pays Broker',
  customerPaysBroker2: 'Customer To Broker 2nd Payment',
  customerPaysCarrier: 'Customer Pays Carrier',
  carrierPaysBroker:   'Carrier Pays Broker',
  brokerPaysCarrier:   'Broker Pays Carrier',
};

export function blankComplexTerms(): ComplexTerms {
  return {
    enabled: false,
    customerPaysBroker: null, customerPaysBroker2: null, customerPaysCarrier: null,
    carrierPaysBroker: null, brokerPaysCarrier: null,
  };
}

/**
 * What the carrier is still owed once every leg has moved: what it is paid
 * directly or through us, less anything it hands on to us. Zero means the
 * legs account for the whole carrier pay; negative means they overshoot it.
 */
export function remainingCarrierPay(t: ComplexTerms, carrierPay: number): number {
  const net = (t.customerPaysCarrier ?? 0) + (t.brokerPaysCarrier ?? 0) - (t.carrierPaysBroker ?? 0);
  return round2((carrierPay || 0) - net);
}

/**
 * The same for our fee: everything that reaches us, less what we pass on to
 * the carrier. A load paid wholly through us (client pays us the rate, we pay
 * the carrier its share) comes out at zero on both sides, as it should.
 */
export function remainingBrokerFee(t: ComplexTerms, brokerFee: number): number {
  const net = (t.customerPaysBroker ?? 0) + (t.customerPaysBroker2 ?? 0)
    + (t.carrierPaysBroker ?? 0) - (t.brokerPaysCarrier ?? 0);
  return round2((brokerFee || 0) - net);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Dollars per mile, or null when there is no distance to divide by. Shown in
 * the Price and Terms header the way BATS shows "Total PPM".
 */
export function perMile(amount: number, miles: number | null | undefined): number | null {
  if (!miles || miles <= 0) return null;
  return round2((amount || 0) / miles);
}
