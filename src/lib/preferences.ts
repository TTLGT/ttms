import { auth } from './firebase';
import type { UserPreferences } from '@/types/userPreferences';

/**
 * Save look-and-feel choices to the signed-in account — see
 * src/types/userPreferences.ts.
 *
 * Fire and forget. The choice has already been applied and written to this
 * browser by the time this runs, so a failed save costs only the copy on the
 * account: the screen is right, and it will be forgotten on another computer.
 * Not worth an error on screen for a colour. Also a no-op when nobody is
 * signed in, which is the case on the login page.
 */
export function saveToAccount(prefs: UserPreferences): void {
  const user = auth.currentUser;
  if (!user) return;
  user.getIdToken()
    .then((idToken) => fetch('/api/me/preferences', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    }))
    .catch(() => { /* see above */ });
}
