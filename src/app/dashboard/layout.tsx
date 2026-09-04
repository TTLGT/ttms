'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  LayoutDashboard,
  ClipboardList,
  Truck,
  Building2,
  Contact,
  MessageCircle,
  PackageCheck,
  ShieldCheck,
  Users,
  Folder,
  BarChart2,
  Settings,
  BookOpen,
  GraduationCap,
  Menu,
  X,
  LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import type { Permission } from '@/types/permission';
import { ChatProvider, useChat } from '@/context/ChatContext';
import { UserAvatar } from '@/components/settings/UserAvatar';
import { ApprovalsProvider, useApprovals } from '@/context/ApprovalsContext';
import ChatPopup from '@/components/chat/ChatPopup';

/**
 * The sidebar, and the permission each entry needs.
 *
 * Naming a permission rather than a role is what makes the sections divisible:
 * somebody given `analytics.view` and nothing else gets Analytics and no other
 * admin screen, and an intern — who holds only the directory, chat and their
 * own area — gets a sidebar with three things on it.
 *
 * `anyOf` for the two screens that are a doorway to several things: Settings
 * opens to a people manager or to HR, and Approvals is worth showing to
 * anybody who can own a record somebody might ask about.
 *
 * This list is a courtesy, not a boundary. Every page behind it is enforced by
 * the API routes it calls and by the Firestore rules underneath those; hiding a
 * link stops somebody wandering in, not somebody trying.
 */
const NAV_ITEMS: {
  href: string;
  label: string;
  Icon: LucideIcon;
  /** Shown when the viewer holds this permission. */
  needs?: Permission;
  /** ...or any one of these. */
  anyOf?: Permission[];
}[] = [
  { href: '/dashboard',           label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/dashboard/orders',    label: 'Orders',    Icon: ClipboardList, needs: 'orders.view' },
  { href: '/dashboard/carriers',  label: 'Carriers',  Icon: Truck,         needs: 'carriers.view' },
  { href: '/dashboard/clients',   label: 'Clients',   Icon: Users,         needs: 'clients.view' },
  { href: '/dashboard/shippers',  label: 'Shippers',  Icon: Building2,     needs: 'shippers.view' },
  { href: '/dashboard/consignees', label: 'Consignees', Icon: PackageCheck, needs: 'consignees.view' },
  // `directory.view` is in this list so an intern gets it too. They own no
  // records and can decide nothing, but they have their own profile — and the
  // request to correct their own phone number lands in this screen's
  // "Your requests" tab like anybody else's.
  { href: '/dashboard/approvals', label: 'Approvals', Icon: ShieldCheck,
    anyOf: ['orders.view', 'clients.view', 'shippers.view', 'consignees.view', 'directory.view'] },
  { href: '/dashboard/documents', label: 'Documents', Icon: Folder,        needs: 'documents.view' },
  // Open to everyone: it is the company phone book, not the access list.
  // What each person is shown depends on their role — see src/lib/directory.ts.
  { href: '/dashboard/directory', label: 'Directory', Icon: Contact,       needs: 'directory.view' },
  // Next to the Directory on purpose: that page is who your colleagues are,
  // this one is talking to them. Open to everyone — chat crosses none of the
  // ownership boundaries the record pages are gated by.
  { href: '/dashboard/chat',      label: 'Chat',      Icon: MessageCircle, needs: 'chat.use' },
  // An intern's own corner: their guide, their onboarding survey, their tasks.
  // Sits below Chat because it is theirs rather than the company's. Admins hold
  // every permission, so they see it too — which is the only way to check what
  // an intern is actually being shown.
  { href: '/dashboard/intern',    label: 'My onboarding', Icon: GraduationCap, needs: 'intern.section' },
  { href: '/dashboard/analytics', label: 'Analytics', Icon: BarChart2,     needs: 'analytics.view' },
  // Also open to HR, who read the people directory there and nothing else —
  // the page itself renders read-only for them.
  { href: '/dashboard/settings',  label: 'Settings',  Icon: Settings,
    anyOf: ['people.manage', 'people.view', 'settings.manage'] },
  { href: '/dashboard/handbook',  label: 'Handbook',  Icon: BookOpen,      needs: 'handbook.view' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router            = useRouter();

  // The shell is exactly the viewport, so the window itself has no business
  // scrolling here. See .app-shell-locked in globals.css for what makes it try.
  useEffect(() => {
    document.documentElement.classList.add('app-shell-locked');
    return () => document.documentElement.classList.remove('app-shell-locked');
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Below the auth gate, never above it: the chat listeners must not attach for
  // an account that has not been through the allowlist check.
  return (
    <ChatProvider>
      <ApprovalsProvider>
        <DashboardShell>{children}</DashboardShell>
      </ApprovalsProvider>
    </ChatProvider>
  );
}

/**
 * The sidebar and the page beside it.
 *
 * Split out from the gate above so that it sits inside ChatProvider — the
 * unread badge in the nav reads the same conversations the chat panel does,
 * rather than opening a second set of listeners to count the same thing.
 */
function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, profile, logout, can } = useAuth();
  const pathname              = usePathname();
  const router                = useRouter();
  const { unreadBadge }                 = useChat();
  const { incoming, outgoing }          = useApprovals();

  /**
   * The sidebar is a drawer on a phone and a column on a desktop.
   *
   * Below `lg` there is not room for both a 240px nav and a readable page, so
   * the same <aside> slides in over the content instead of sitting beside it.
   * It is one element in both cases rather than two rendered copies: a second
   * copy would mean the badge counts, the permission filter and the "which
   * item is lit" test all existing twice, and the two drifting apart.
   *
   * This state does nothing at `lg` and up — the drawer classes are all
   * `lg:`-reset, so the desktop layout is exactly what it was.
   */
  const [navOpen, setNavOpen] = useState(false);

  // Tapping a link should leave you looking at the page, not at the menu you
  // opened it from. Keyed on the path so it also closes on a back gesture.
  useEffect(() => { setNavOpen(false); }, [pathname]);

  // Escape closes it, the same as any other thing that covers the screen.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setNavOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  /**
   * Which nav item to light up. Dashboard is matched exactly — every other
   * page lives under /dashboard, so a prefix test would leave it lit
   * everywhere. The rest match their own subtree, so an order's detail page
   * keeps Orders highlighted.
   */
  const isCurrent = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href);

  /** The sidebar this viewer actually gets. */
  const visible = useMemo(
    () => NAV_ITEMS.filter((item) => {
      if (item.needs) return can(item.needs);
      if (item.anyOf) return item.anyOf.some((p) => can(p));
      return true;
    }),
    [can],
  );

  /**
   * Somebody who typed, bookmarked or was sent the address of a section they
   * cannot open lands on the first one they can.
   *
   * Not a security measure — the data behind these pages is gated server-side,
   * and an intern who reaches /dashboard/orders is served an empty list rather
   * than somebody else's loads. This is about not leaving them on a screen with
   * nothing on it and no way out: the sidebar has no entry for the page they
   * are on, so there is nothing to click.
   *
   * Dashboard is deliberately exempt. It is everybody's landing page and shows
   * each person only what they can already see.
   */
  useEffect(() => {
    if (pathname === '/dashboard') return;

    const item = NAV_ITEMS.find(
      (i) => i.href !== '/dashboard' && pathname.startsWith(i.href),
    );
    // A page with no nav entry of its own — an order's detail view, say — is
    // left alone: it was reached from a list that had already been gated.
    if (!item) return;
    if (visible.some((i) => i.href === item.href)) return;

    router.replace(visible[0]?.href ?? '/dashboard');
  }, [pathname, visible, router]);

  /**
   * The badges on a nav item. Most carry none; Approvals can carry two.
   *
   * Red is work waiting on you — a request you have to decide, which is
   * blocking whoever raised it. Amber is you waiting on somebody else: worth
   * knowing, nothing to do about it. Two colours rather than one number
   * because those are different pieces of news, and summing them would tell
   * you neither.
   *
   * Counted in ApprovalsContext, so this and the Approvals screen cannot end
   * up disagreeing about the same queue.
   */
  const badgesFor = (href: string): { key: string; text: string; className: string }[] => {
    if (href === '/dashboard/approvals') {
      return [
        incoming > 0 && { key: 'in',  text: String(incoming), className: 'bg-red-500 text-white' },
        outgoing > 0 && { key: 'out', text: String(outgoing), className: 'bg-amber-400 text-brand-900' },
      ].filter(Boolean) as { key: string; text: string; className: string }[];
    }
    // Messages waiting, built once in ChatContext so this and the popup bubble
    // cannot end up showing different numbers for the same thing.
    if (href === '/dashboard/chat' && unreadBadge !== '') {
      return [{ key: 'chat', text: unreadBadge, className: 'bg-amber-400 text-brand-900' }];
    }
    return [];
  };

  return (
    /* h-screen + overflow-hidden, not min-h-screen: the shell is exactly the
       viewport, so a long page scrolls inside <main> instead of scrolling the
       window and carrying the nav off the top of the screen with it.

       `app-shell` is what globals.css hangs the mobile-browser height fix on —
       see the comment there. It carries no styles of its own, so h-screen is
       still what sizes this on anything that does not support dvh. */
    <div className="app-shell h-screen flex overflow-hidden">
      {/*
        The drawer's backdrop. Rendered only while it is open and only below
        `lg`, so on a desktop there is never an invisible layer over the page.
      */}
      {navOpen && (
        <div
          onClick={() => setNavOpen(false)}
          aria-hidden
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      )}

      {/* Sidebar — a column on a desktop, a drawer over the page on a phone.
          Only its nav list scrolls, in both cases. */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 flex-shrink-0 bg-brand-900 text-white flex flex-col transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0 ${
          navOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex-shrink-0 px-4 py-4 border-b border-brand-700 flex items-center gap-3">
          <Image src="/logo-circle.png" alt="TTL" width={44} height={44} className="flex-shrink-0" />
          <div className="min-w-0">
            <p className="font-[family-name:var(--font-rajdhani)] text-3xl font-bold tracking-[0.2em] pl-[0.2em] leading-tight text-white">TTMS</p>
            <p className="text-[10px] font-medium uppercase tracking-widest text-blue-300 mt-0.5">Total Transportation Management System</p>
          </div>
          {/* A way out that is not "tap the sliver of page still showing" —
              on a narrow phone the drawer covers nearly all of it. */}
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            aria-label="Close menu"
            className="-mr-1 ml-auto flex-shrink-0 rounded-lg p-1.5 text-blue-200 transition hover:bg-brand-700 hover:text-white lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        {/* min-h-0 is load-bearing: a flex child defaults to min-height:auto and
            would refuse to shrink below its content, so the list would push the
            sign-out block off-screen instead of scrolling. */}
        <nav className="flex-1 min-h-0 overflow-y-auto sidebar-scroll px-3 py-4 space-y-1">
          {visible.map(({ href, label, Icon }) => {
            const current = isCurrent(href);
            const badges  = badgesFor(href);
            return (
            <Link
              key={href}
              href={href}
              aria-current={current ? 'page' : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                current
                  ? 'bg-brand-700 text-white'
                  : 'text-blue-100 hover:bg-brand-700 hover:text-white'
              }`}
            >
              <Icon size={16} className="flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {badges.map((b) => (
                <span
                  key={b.key}
                  title={b.key === 'in'
                    ? 'Waiting on you'
                    : b.key === 'out' ? 'Your requests, still undecided' : undefined}
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${b.className}`}
                >
                  {b.text}
                </span>
              ))}
            </Link>
            );
          })}
        </nav>

        {/*
          Who you are signed in as, and the way into your own record.

          The picture and the name come off `users/{uid}` — the photo an admin
          uploaded in Settings → People, mirrored onto the profile — and not
          off the Google account. Those are two different pictures: Google's is
          whatever the person set on their personal account years ago, while
          the one here is the one their colleagues see beside them in the
          directory and in chat. Showing the wrong one in the one place a
          person looks at their own name was the most visible way this
          disagreed with itself.

          Both update without a sign-out, because AuthContext keeps a live
          watch on that document — see watchOwnProfile there.

          The whole block is the link to /dashboard/profile rather than a
          separate "My profile" nav item: your own name in the corner is where
          people already click looking for their own details.
        */}
        <div className="flex-shrink-0 px-4 py-4 border-t border-brand-700">
          <Link
            href="/dashboard/profile"
            aria-current={isCurrent('/dashboard/profile') ? 'page' : undefined}
            title="Your details, and how to ask for a change"
            className={`-mx-2 mb-2 flex items-center gap-3 rounded-lg px-2 py-2 transition ${
              isCurrent('/dashboard/profile') ? 'bg-brand-700' : 'hover:bg-brand-700'
            }`}
          >
            <UserAvatar
              photoPath={profile?.photoPath}
              fallback={(profile?.displayName || user?.email || '?').charAt(0).toUpperCase()}
              size={32}
            />
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-white truncate">
                {profile?.displayName || user?.displayName}
              </p>
              <p className="text-xs text-blue-300 truncate">{user?.email}</p>
            </div>
          </Link>
          <button
            onClick={logout}
            className="w-full text-xs text-blue-300 hover:text-white transition text-left"
          >
            Sign out →
          </button>
        </div>
      </aside>

      {/* min-w-0 is load-bearing here for the same reason min-h-0 is on the
          nav: a flex child will not shrink below its content, so a wide table
          inside <main> would stretch this column and push the page off the
          right of a phone screen instead of scrolling inside its own box. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          The phone's title bar. It exists because the sidebar — which is the
          only way between sections — is off-screen below `lg`, so without it
          there is no way to open the menu. Hidden at `lg` and up, where the
          sidebar is its own header.
        */}
        <header className="flex flex-shrink-0 items-center gap-3 border-b border-brand-700 bg-brand-900 px-3 py-2.5 text-white lg:hidden">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            aria-expanded={navOpen}
            className="rounded-lg p-1.5 text-blue-100 transition hover:bg-brand-700 hover:text-white"
          >
            <Menu size={22} />
          </button>
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
            <Image src="/logo-circle.png" alt="TTL" width={28} height={28} className="flex-shrink-0" />
            <span className="font-[family-name:var(--font-rajdhani)] text-2xl font-bold tracking-[0.2em] pl-[0.2em] leading-none text-white">
              TTMS
            </span>
          </Link>
          {/* The same destination as the block at the foot of the sidebar, so
              your own record stays one tap away without opening the menu. */}
          <Link
            href="/dashboard/profile"
            aria-current={isCurrent('/dashboard/profile') ? 'page' : undefined}
            title="Your details, and how to ask for a change"
            className="ml-auto flex-shrink-0 rounded-full"
          >
            <UserAvatar
              photoPath={profile?.photoPath}
              fallback={(profile?.displayName || user?.email || '?').charAt(0).toUpperCase()}
              size={30}
            />
          </Link>
        </header>

        <main className="flex-1 overflow-y-auto bg-gray-50">
          {children}
        </main>
      </div>

      {/* Over every page but the chat page itself, so a quick word does not
          cost you the order you were in the middle of. */}
      <ChatPopup />
    </div>
  );
}
