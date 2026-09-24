/*
 * The part of the theme switch that runs before React does — see
 * src/lib/theme.ts for the rest and for why the choice is per browser.
 *
 * Its own module, without 'use client', because the root layout is a server
 * component: a constant imported from a client module arrives there as a
 * client reference, not as the string.
 */

export const THEME_STORAGE_KEY = 'ttms-theme';
export const DARK_QUERY = '(prefers-color-scheme: dark)';

/*
 * Runs in <head> before the first paint (see src/app/layout.tsx). Without it
 * the page is drawn light, React hydrates, and only then goes dark — a white
 * flash on every reload for exactly the people who asked not to have one.
 * Written out as a string because it runs before any bundle has loaded; keep
 * it in step with `prefersDark()` in theme.ts.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var c=localStorage.getItem('${THEME_STORAGE_KEY}');var d=c==='dark'||(c==='system'&&window.matchMedia('${DARK_QUERY}').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;
