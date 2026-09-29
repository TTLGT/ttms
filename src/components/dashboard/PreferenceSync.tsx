'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { storeTheme, storedTheme } from '@/lib/theme';
import { storeChatWallpaper, storedChatWallpaper } from '@/lib/chatWallpaper';
import { storeLearnEnglish, storedLearnEnglish } from '@/context/LearnContext';
import { saveToAccount } from '@/lib/preferences';
import type { UserPreferences } from '@/types/userPreferences';

/*
 * Keeps this browser's look-and-feel choices and the account's in step — see
 * src/types/userPreferences.ts. Draws nothing.
 *
 * Account → browser: whenever the account's value changes, it is written into
 * this browser and applied. That is what brings the theme back on a browser
 * that forgot it overnight, and what carries a change made on one computer to
 * another that is open at the time — the profile is already watched live by
 * AuthContext, so this costs no read of its own.
 *
 * Only a *change* on the account is applied, not every snapshot: the profile
 * document moves for plenty of other reasons (a photo, a permission), and
 * re-applying on each would undo a choice made in this tab a moment before its
 * own save came back.
 *
 * Browser → account, once per page load: anything this browser holds that the
 * account has never had is copied up. Everybody's choices lived only in the
 * browser until this existed, and that is how they get onto the account
 * without anybody having to pick again.
 *
 * Needs the profile to carry `preferences` from the first render —
 * /api/auth/session sees to that — or the copy-up would take "not loaded yet"
 * for "never saved" and overwrite the account with this browser's value.
 */
export default function PreferenceSync() {
  const { profile } = useAuth();
  const prefs = profile?.preferences;
  const seen = useRef<UserPreferences>({});
  const copiedUp = useRef(false);

  useEffect(() => {
    if (!profile) return;
    const account = prefs ?? {};
    const last = seen.current;

    if (account.theme && account.theme !== last.theme && account.theme !== storedTheme()) {
      storeTheme(account.theme);
    }
    if (account.chatWallpaper && account.chatWallpaper !== last.chatWallpaper
        && account.chatWallpaper !== storedChatWallpaper()) {
      storeChatWallpaper(account.chatWallpaper);
    }
    if (typeof account.learnEnglish === 'boolean' && account.learnEnglish !== last.learnEnglish
        && account.learnEnglish !== storedLearnEnglish()) {
      storeLearnEnglish(account.learnEnglish);
    }
    seen.current = account;

    if (!copiedUp.current) {
      copiedUp.current = true;
      const missing: UserPreferences = {};
      const theme = storedTheme();
      const wallpaper = storedChatWallpaper();
      const learn = storedLearnEnglish();
      if (!account.theme && theme) missing.theme = theme;
      if (!account.chatWallpaper && wallpaper) missing.chatWallpaper = wallpaper;
      if (typeof account.learnEnglish !== 'boolean' && learn !== null) missing.learnEnglish = learn;
      if (Object.keys(missing).length > 0) saveToAccount(missing);
    }
  }, [profile, prefs]);

  return null;
}
