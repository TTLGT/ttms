'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, LayoutList, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import SettingsNav from '@/components/settings/SettingsNav';
import SettingsSearch from '@/components/settings/SettingsSearch';
import { SettingsDataProvider } from '@/components/settings/SettingsData';
import { SaveBarOutlet, SaveBarProvider, useSaveVersion } from '@/components/settings/kit/SaveBar';
import { Chip } from '@/components/settings/kit/ui';
import {
  SETTINGS_GROUPS,
  canOpenSettings,
  pageFromPath,
  scrollToAnchor,
  type SettingsAccess,
  type SettingsPage,
} from '@/components/settings/settingsSections';
import { useLastChange } from '@/lib/settingsChanges';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { Bi } from '@/components/spanish/Es';

/**
 * The frame around every Settings page: a side menu grouped by topic, and one
 * setting per page beside it.
 *
 * Settings was seven tabs, one of which ("Operations") held ten unrelated
 * panels laid out by height. Everything now has a page of its own, at its own
 * address, listed once in `settingsSections.ts`; this layout draws the menu
 * from that list, the page's title and "Last changed" line from the same
 * entry, and the Save bar at the foot of whatever page is open.
 *
 * A layout does not re-render its state away when moving between the pages
 * beneath it, so the menu, the search box and the settings it has loaded all
 * survive a click. Each page is a real URL — linkable, bookmarkable, and the
 * back button works — which is why the current page is read from the
 * pathname and never mirrored in state.
 *
 * **Access is decided per page, here.** A page whose `access()` is false for
 * this reader is never mounted: they are sent to Settings Home instead. The
 * routes behind every page check the permission again; this only decides
 * what is drawn.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { profile, can, loading } = useAuth();
  const router   = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const isSalesManager = profile?.isSalesManager === true;
  const access = useMemo<SettingsAccess>(() => ({ can, isSalesManager }), [can, isSalesManager]);
  const allowed = canOpenSettings(access);
  const page = pageFromPath(pathname);
  // The old tab addresses (/settings/operations and friends) are not pages;
  // their own route sends them on, so they must not be bounced here first.
  const legacy = /^\/dashboard\/settings\/(organization|operations|attendance|data)\/?$/.test(pathname);
  const pageAllowed = legacy || (page !== null && page.access(access) !== false);

  useEffect(() => {
    if (loading) return;
    if (!allowed) router.replace('/dashboard');
    else if (!pageAllowed) router.replace('/dashboard/settings');
  }, [loading, allowed, pageAllowed, router]);

  // A hash typed, pasted or arrived at from another page. The panels render
  // their rows after the navigation lands, so the browser's own jump has
  // already given up — this waits for the element.
  useEffect(() => scrollToAnchor(decodeURIComponent(window.location.hash.slice(1))), [pathname]);

  // The phone's menu sheet closes itself when the page changes.
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  if (loading || !allowed || !pageAllowed) return null;

  const isHome = page?.id === 'home';
  const seesPeople = Boolean(pageFromPath('/dashboard/settings/people')?.access(access));

  return (
    <SaveBarProvider>
      <SettingsDataProvider access={access}>
        {/* Not centred: every other TTMS page starts against the sidebar, and
            centring left a wide empty band between the two menus on a big
            screen. */}
        <div className="max-w-[1600px] p-4 sm:p-6 lg:p-8">
          <div className="grid items-start gap-6 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-8">
            {/* On a phone the menu is the Home page's first screen, and a
                sheet everywhere else; on a desktop it is always beside the
                page, sticky so it stays in reach down a long one. */}
            <aside className={`${isHome ? 'block' : 'hidden'} lg:sticky lg:top-0 lg:block lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pb-6`}>
              <div className="mb-4 flex items-baseline justify-between gap-2 px-1">
                <h1 className="font-[family-name:var(--font-rajdhani)] text-2xl font-bold tracking-wide text-gray-900">
                  <Link href="/dashboard/settings" data-es>Settings</Link>
                </h1>
              </div>
              <div className="mb-4">
                <SettingsSearch access={access} profile={profile} seesPeople={seesPeople} />
              </div>
              <SettingsNav access={access} currentId={page?.id ?? null} canPreview={can('people.manage')} />
            </aside>

            <div className="min-w-0">
              {!isHome && (
                <div className="mb-3 flex items-center justify-between gap-2 lg:hidden">
                  <Link href="/dashboard/settings" className="flex items-center gap-1 text-sm font-medium text-brand-700">
                    <ChevronLeft size={16} /> <span data-es>Settings</span>
                  </Link>
                  <button type="button" onClick={() => setMenuOpen(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700">
                    <LayoutList size={15} /> <span data-es>All settings</span>
                  </button>
                </div>
              )}

              {page && <PageHeader page={page} access={access} />}

              <div className="mt-6">{children}</div>
              <SaveBarOutlet />
            </div>
          </div>
        </div>

        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="All settings">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-[min(20rem,88vw)] overflow-y-auto bg-gray-50 p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between">
                <p data-es className="font-[family-name:var(--font-rajdhani)] text-xl font-bold text-gray-900">Settings</p>
                <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close" className="rounded p-1 text-gray-500 hover:bg-gray-200">
                  <X size={18} />
                </button>
              </div>
              <div className="mb-4">
                <SettingsSearch access={access} profile={profile} seesPeople={seesPeople} />
              </div>
              <SettingsNav access={access} currentId={page?.id ?? null} canPreview={false} onNavigate={() => setMenuOpen(false)} />
            </div>
          </div>
        )}
      </SettingsDataProvider>
    </SaveBarProvider>
  );
}

/**
 * The page's title, what makes it risky, what it is for, and who last
 * changed it — all from its entry in `settingsSections.ts`, so no page draws
 * its own and none can be missing one.
 */
function PageHeader({ page, access }: { page: SettingsPage; access: SettingsAccess }) {
  const version = useSaveVersion();
  const last = useLastChange(page.areas ?? [], version);
  const { formatDateTime } = useDateFormatters();
  const group = SETTINGS_GROUPS.find((g) => g.id === page.group)?.label;
  const readOnly = page.access(access) === 'view' && page.id !== 'home' && page.id !== 'change-log';

  return (
    <header>
      {group && <p data-es className="text-xs font-medium text-gray-400">{group}</p>}
      <div className="mt-0.5 flex flex-wrap items-center gap-2.5">
        <h2 className="font-[family-name:var(--font-rajdhani)] text-3xl font-bold tracking-wide text-gray-900">
          <span data-es>{page.id === 'home' ? 'Settings' : page.label}</span>
        </h2>
        {page.risk && <Chip>{page.risk}</Chip>}
        {readOnly && <Chip tone="gray">View only</Chip>}
      </div>
      <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-gray-500"><Bi>{page.blurb}</Bi></p>
      {last && (
        <p className="mt-2 text-xs text-gray-400">
          Last changed by <span className="font-medium text-gray-600">{last.byName || last.byEmail}</span>
          {last.at ? `, ${formatDateTime(last.at)}` : ''}
          {' · '}
          <Link href={`/dashboard/settings/change-log?area=${(page.areas ?? []).join(',')}`} className="font-medium text-brand-700 hover:underline">
            <span data-es>See history</span>
          </Link>
        </p>
      )}
    </header>
  );
}
