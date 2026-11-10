'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { cityOfZone, detectTimeZone, isTimeZoneName } from '@/types/clockChange';
import { auth } from './firebase';

/**
 * Whose clock the clock change banner and the US time zones section measure
 * from: the city the person picked on My profile, else this computer's zone.
 *
 * The pick lives on the account (`preferences.timeZone`), so it follows them
 * to any computer and arrives through AuthContext's live profile — no read of
 * its own. Detection waits for the first effect: the server renders this too
 * and has no idea where the reader is, and guessing there would make the two
 * renders disagree.
 */
export interface MyTimeZone {
  /** False until the browser has been asked. Draw nothing time-dependent before. */
  ready: boolean;
  tz: string;
  /** What to call it on screen — the city they picked, or the zone's own city. */
  name: string;
  picked: boolean;
  /** This computer's zone, whatever was picked. */
  detected: string;
}

export function useMyTimeZone(): MyTimeZone {
  const { profile } = useAuth();
  const [detected, setDetected] = useState<string | null>(null);

  useEffect(() => { setDetected(detectTimeZone()); }, []);

  const prefs = profile?.preferences;
  const picked = isTimeZoneName(prefs?.timeZone) ? prefs.timeZone : null;
  const here = detected ?? '';
  const tz = picked ?? here;
  const name = picked ? (prefs?.timeZoneCity?.trim() || cityOfZone(picked)) : here ? cityOfZone(here) : '';

  return { ready: detected !== null && tz !== '', tz, name, picked: picked !== null, detected: here };
}

/**
 * Save or clear the pick. Unlike saveToAccount() this waits and throws, because
 * the setting card says "Saved" and must not say it about a save that failed.
 * `null` goes back to Automatic.
 */
export async function saveMyTimeZone(pick: { tz: string; city: string } | null): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('You are signed out. Sign in again and retry.');
  const idToken = await user.getIdToken();
  const res = await fetch('/api/me/preferences', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(pick ? { timeZone: pick.tz, timeZoneCity: pick.city } : { timeZone: null }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || 'Could not save your time zone.');
  }
}
