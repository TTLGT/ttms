import { auth } from './firebase';
import { DEFAULT_APP_SETTINGS } from '@/types/appSettings';
import type { AppSettings, LaneDistanceMode } from '@/types/appSettings';

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
  const res = await fetch('/api/app-settings', {
    method: 'PUT',
    headers: await authHeaders(),
    body: JSON.stringify({ laneDistanceMode: mode }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed to save the setting');
  // The next reader must see the new mode, not the one from before the change.
  cached = null;
}
