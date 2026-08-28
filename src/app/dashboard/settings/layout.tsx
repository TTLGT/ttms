'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import SettingsSearch from '@/components/settings/SettingsSearch';
import { SETTINGS_TABS, scrollToAnchor } from '@/components/settings/settingsSections';

/**
 * The frame around every Settings tab: title, tab bar, search box.
 *
 * Settings used to be one page with nine panels stacked down it, which meant
 * scrolling past everything to reach anything. The panels themselves did not
 * change — they were split across four routes, and this layout is what makes
 * them read as one screen with tabs rather than four unrelated pages.
 *
 * A layout does not re-render when you move between the pages beneath it, so
 * the tab bar and whatever is typed in the search box both survive the
 * navigation. Each tab is a real URL, so it can be linked to, bookmarked and
 * gone back from — which is the whole reason these are routes and not a
 * useState holding a tab name. Never mirror the active tab in state: the
 * moment the two disagree, the back button starts lying.
 */

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin, isHr, loading } = useAuth();
  const router   = useRouter();
  const pathname = usePathname();

  // HR belongs in here — read-only, People only. Anyone else is bounced, and
  // the Firestore rules refuse them independently of this. Gating in the
  // layout rather than in each page means a new tab cannot be added without
  // the check, and the pages below never mount for someone who should not see
  // them at all.
  const allowed = isAdmin || isHr;

  useEffect(() => {
    if (!loading && !allowed) router.replace('/dashboard');
  }, [loading, allowed, router]);

  // A hash typed, pasted or arrived at from another tab. The browser's own
  // hash scrolling has already given up by now — the panels render their rows
  // after the navigation lands — so it is done here instead. Re-runs per tab,
  // which is what a cross-tab jump needs; the search box handles its own
  // scroll for a jump within the tab you are already on.
  useEffect(() => {
    return scrollToAnchor(decodeURIComponent(window.location.hash.slice(1)));
  }, [pathname]);

  if (loading || !allowed) return null;

  const tabs = SETTINGS_TABS.filter((t) => isAdmin || !t.adminOnly);

  /**
   * People is the one tab that is a list of many records rather than a stack
   * of settings panels, so it gets the whole screen and lays its people out
   * two abreast. The other four stay narrow on purpose: a form field stretched
   * across 1600px is harder to read, not easier.
   */
  const wide = pathname.startsWith('/dashboard/settings/people');

  return (
    <div className={`p-8 ${wide ? 'max-w-[1600px]' : 'max-w-3xl'}`}>
      {/* Sticky so the tabs stay reachable while a long tab — People, mostly —
          is scrolled. `top-0` refers to <main>, which is the scroll container;
          the background is opaque so rows do not show through it. */}
      <div className="sticky top-0 z-10 -mx-8 -mt-8 bg-gray-50 px-8 pt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {isAdmin
                ? 'Access, permissions, sites, teams and how orders are worked out'
                : 'The company directory. Read-only — ask an admin to change anything here.'}
            </p>
          </div>
          <SettingsSearch isAdmin={isAdmin} />
        </div>

        {/* One tab is not a tab bar. HR sees only People, so they get the
            page without the furniture. */}
        {tabs.length > 1 && (
          <nav className="mt-5 flex gap-1 border-b border-gray-200">
            {tabs.map((tab) => {
              // Overview is the parent of the others, so it can only match
              // exactly — otherwise it would light up on every tab.
              const current = pathname === tab.href;
              return (
                <Link
                  key={tab.id}
                  href={tab.href}
                  aria-current={current ? 'page' : undefined}
                  className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                    current
                      ? 'border-brand-600 text-brand-700'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>

      <div className="pt-6">{children}</div>
    </div>
  );
}
