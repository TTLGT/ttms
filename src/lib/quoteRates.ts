import { auth } from './firebase';
import { DEFAULT_QUOTE_RATES, type QuoteRates } from '@/types/quoteRates';

/**
 * Client access to the quote calculator's rate card, through /api/quote-rates.
 *
 * Shared across the page session like `getAppSettings()`: the calculator page,
 * the dialog on the order form and the Settings panel want the same answer,
 * and it changes when somebody updates the rates, not while a broker types.
 */

export type QuoteRatesResponse = {
  rates: QuoteRates;
  /** Nothing has been saved yet, or what was saved could not be read. */
  isDefault: boolean;
  /** Why a saved card was set aside, when it was. */
  problem: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

async function authHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${await user.getIdToken()}`,
  };
}

let cached: Promise<QuoteRatesResponse> | null = null;

export function getQuoteRates(): Promise<QuoteRatesResponse> {
  if (!cached) {
    cached = (async () => {
      const res = await fetch('/api/quote-rates', { headers: await authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Could not load the quote rates');
      return data as QuoteRatesResponse;
    })().catch((e) => {
      // Not cached, or one flaky load would leave the calculator on the
      // defaults until a full refresh.
      cached = null;
      throw e;
    });
  }
  return cached;
}

/**
 * The rates, or the built-in defaults on failure — for the calculator, where a
 * broker on the phone with a client is better served by the sheet's numbers
 * than by an error. It says so on screen when this happens.
 */
export async function getQuoteRatesOrDefaults(): Promise<QuoteRatesResponse & { failed: boolean }> {
  try {
    return { ...(await getQuoteRates()), failed: false };
  } catch {
    return {
      rates: DEFAULT_QUOTE_RATES, isDefault: true, problem: null,
      updatedAt: null, updatedBy: null, failed: true,
    };
  }
}

export async function saveQuoteRates(rates: QuoteRates): Promise<QuoteRates> {
  const res = await fetch('/api/quote-rates', {
    method: 'PUT',
    headers: await authHeaders(),
    body: JSON.stringify({ rates }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Could not save the quote rates');
  cached = null;
  return (data as { rates: QuoteRates }).rates;
}
