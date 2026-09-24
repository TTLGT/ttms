import { auth } from './firebase';
import { DEFAULT_APP_SETTINGS } from '@/types/appSettings';
import type { AppSettings, DateFormat, LaneDistanceMode } from '@/types/appSettings';
import type { Celebration, CelebrationTemplates } from '@/types/celebration';
import { PAYMENT_LIST_KEY } from '@/types/paymentMethod';
import type { PaymentMethod, PaymentSide } from '@/types/paymentMethod';

/**
 * Client access to the company-wide settings document.
 *
 * Reads are shared across every caller in the page session — the order form,
 * the order detail page and the Settings panel all want the same answer, and
 * it changes about once a year.
 */

async function authHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${await user.getIdToken()}`,
  };
}

/**
 * What /api/chat/celebrations reports back for a preview. Mirrors
 * `CelebrationRun` in src/lib/celebrations.ts, which cannot be imported here:
 * that module pulls in the Admin SDK and this one runs in the browser.
 */
export type CelebrationRun = {
  outcome: 'posted' | 'preview' | 'disabled' | 'nobody' | 'already-posted' | 'no-room';
  date: string;
  celebrations: Celebration[];
  message: string;
};

export type AppSettingsResponse = {
  settings: AppSettings;
  /** Whether GOOGLE_MAPS_API_KEY is present on the server. Never the key itself. */
  routesKeyConfigured: boolean;
};

let cached: Promise<AppSettingsResponse> | null = null;

async function fetchSettings(): Promise<AppSettingsResponse> {
  const res = await fetch('/api/app-settings', { headers: await authHeaders() });
  if (!res.ok) throw new Error('Failed to load settings');
  return (await res.json()) as AppSettingsResponse;
}

export function getAppSettings(): Promise<AppSettingsResponse> {
  if (!cached) {
    cached = fetchSettings().catch((e) => {
      // Don't cache a failure, or one flaky load would leave the page stuck on
      // defaults until a full refresh.
      cached = null;
      throw e;
    });
  }
  return cached;
}

/**
 * Settings with defaults substituted on any failure. For callers that only
 * want to know how to render and have nothing useful to say about an error.
 */
export async function getAppSettingsOrDefaults(): Promise<AppSettingsResponse> {
  try {
    return await getAppSettings();
  } catch {
    return { settings: DEFAULT_APP_SETTINGS, routesKeyConfigured: false };
  }
}

export async function saveLaneDistanceMode(mode: LaneDistanceMode): Promise<void> {
  await saveSetting({ laneDistanceMode: mode });
}

export async function saveDateFormat(format: DateFormat): Promise<void> {
  await saveSetting({ dateFormat: format });
}

export async function saveCelebrations(on: boolean): Promise<void> {
  await saveSetting({ celebrations: on });
}

/** Both templates together — they are one edit in one panel. */
export async function saveCelebrationTemplates(templates: CelebrationTemplates): Promise<void> {
  await saveSetting({ celebrationTemplates: templates });
}

/** One side's whole list — the panel edits a list, not an entry. */
export async function savePaymentMethods(side: PaymentSide, methods: PaymentMethod[]): Promise<void> {
  await saveSetting({ [PAYMENT_LIST_KEY[side]]: methods });
}

/** What the daily celebrations post would say today, without sending it. */
export async function previewCelebrations(today?: string): Promise<CelebrationRun> {
  const res = await fetch('/api/chat/celebrations', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ today }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Could not check today');
  return (data as { run: CelebrationRun }).run;
}

/** Send one changed setting. Anything not named keeps its stored value. */
async function saveSetting(patch: Partial<AppSettings>): Promise<void> {
  const res = await fetch('/api/app-settings', {
    method: 'PUT',
    headers: await authHeaders(),
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed to save the setting');
  // The next reader must see the new value, not the one from before the change.
  cached = null;
}
