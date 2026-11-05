'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookMarked,
  ChevronsUpDown,
  Languages,
  LogOut,
  Monitor,
  Moon,
  MousePointer2,
  PanelLeft,
  PanelLeftClose,
  Sun,
  SunMoon,
  UserRound,
  LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLearn } from '@/context/LearnContext';
import { useSpanish } from '@/context/SpanishContext';
import { UserAvatar } from '@/components/settings/UserAvatar';
import { THEME_CHOICES, ThemeChoice, useTheme } from '@/lib/theme';
import { SIDEBAR_MODES, SidebarMode } from '@/lib/sidebarMode';

/*
 * The account menu at the foot of the sidebar: your name, and behind it
 * everything that is about you rather than about the company's records —
 * your profile, the theme, how the sidebar sits, the two language aids, and
 * signing out.
 *
 * It replaced a stack of five unlabelled controls (two switches, two rows of
 * bare icons and a "Sign out →" link) under a name that did not look
 * clickable. Two complaints drove it: the footer read as clutter, and nobody
 * found their own profile, because the only way in was clicking your own
 * name. Now the name is visibly a button, and "My profile" is the first thing
 * in what it opens, with every other choice labelled in words.
 *
 * Portalled to <body>, for two reasons. The sidebar is `overflow-hidden`, so a
 * menu inside it would be clipped at its edge — and on the rail the menu has
 * to open to the right, outside it. And the <aside> carries a transform (its
 * drawer slide), which would make `position: fixed` relative to the sidebar
 * instead of the window.
 *
 * Drawn as an ordinary card (`bg-white`, `text-gray-*`), so dark mode needs
 * nothing of its own — see tailwind.config.ts. The trigger is drawn for the
 * sidebar, which is brand-900 in both themes.
 */

const THEME_OPTIONS: Record<ThemeChoice, { icon: LucideIcon; label: string; title: string }> = {
  light:  { icon: Sun,     label: 'Light', title: 'Light' },
  dim:    { icon: SunMoon, label: 'Dim',   title: 'Dark, with lighter grounds' },
  dark:   { icon: Moon,    label: 'Dark',  title: 'Dark' },
  system: { icon: Monitor, label: 'Auto',  title: 'Match this computer' },
};

const SIDEBAR_OPTIONS: Record<SidebarMode, { icon: LucideIcon; label: string; title: string }> = {
  expanded:  { icon: PanelLeft,      label: 'Open',     title: 'Keep the menu open' },
  collapsed: { icon: PanelLeftClose, label: 'Icons',    title: 'Fold the menu down to icons' },
  auto:      { icon: MousePointer2,  label: 'On hover', title: 'Open the menu when the pointer is over it' },
};

const MENU_WIDTH = 288;
const GAP = 8;

export default function AccountMenu({
  rail,
  sidebarMode,
  onSidebarMode,
  onOpenChange,
}: {
  /** The sidebar is a rail of icons right now (desktop only). */
  rail: boolean;
  sidebarMode: SidebarMode;
  onSidebarMode: (next: SidebarMode) => void;
  /**
   * Told when the menu opens and closes, so a sidebar in `auto` stays open
   * while it is up. Without that, moving the pointer into the menu — which is
   * outside the sidebar on screen — would fold the sidebar away under it.
   * Pass a stable function (a state setter).
   */
  onOpenChange?: (open: boolean) => void;
}) {
  const { user, profile, logout } = useAuth();
  const pathname = usePathname();
  const { choice: theme, setChoice: setTheme } = useTheme();
  const { enabled: learnOn, setEnabled: setLearnOn } = useLearn();
  const { on: spanishOn, setOn: setSpanishOn } = useSpanish();

  const [open, setOpenState] = useState(false);
  const [pos, setPos] = useState<{ left: number; bottom: number; maxHeight: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  }, [onOpenChange]);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, [setOpen]);

  // Following a link out of the menu should leave you on the page, not the menu.
  useEffect(() => { setOpen(false); }, [pathname, setOpen]);

  /*
   * Where the menu sits. Above the button while the sidebar is open — the
   * button is at the foot of the window, so there is no room below it. To the
   * right of it on the rail, where the sidebar is too narrow to hold the menu.
   */
  const place = useCallback(() => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const desktopRail = rail && window.matchMedia('(min-width: 1024px)').matches;
    let left: number;
    let bottom: number;
    if (desktopRail) {
      left = r.right + 12;
      bottom = Math.max(GAP, vh - r.bottom);
    } else {
      left = r.left;
      bottom = vh - r.top + GAP;
    }
    left = Math.max(GAP, Math.min(left, vw - MENU_WIDTH - GAP));
    setPos({ left, bottom, maxHeight: vh - bottom - GAP });
  }, [rail]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, place]);

  // Focus moves into the menu so the keyboard can walk it from the top.
  useEffect(() => {
    if (open && pos) panelRef.current?.focus();
  }, [open, pos]);

  useEffect(() => {
    if (!open) return;
    // Capture on the document, and stopped there: the layout also listens for
    // Escape, to close the phone drawer, and one press should close one thing.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close(true);
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open, close]);

  const name = profile?.displayName || user?.displayName || user?.email || '';
  const fallback = (profile?.displayName || user?.email || '?').charAt(0).toUpperCase();
  const onProfile = pathname.startsWith('/dashboard/profile');
  const onWords = pathname.startsWith('/dashboard/words');

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={rail ? 'Your account and settings' : undefined}
        title={rail ? 'Your account and settings' : undefined}
        className={`group -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
          rail ? 'lg:justify-center' : ''
        } ${open || onProfile ? 'bg-brand-700' : 'hover:bg-brand-700'}`}
      >
        <UserAvatar photoPath={profile?.photoPath} fallback={fallback} size={32} />
        <div className={`min-w-0 flex-1 ${rail ? 'lg:hidden' : ''}`}>
          <p className="truncate text-sm font-medium text-white">{name}</p>
          <p className="truncate text-xs text-blue-300">{user?.email}</p>
        </div>
        <ChevronsUpDown
          size={16}
          aria-hidden
          className={`flex-shrink-0 text-blue-300 transition group-hover:text-white ${rail ? 'lg:hidden' : ''}`}
        />
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          role="menu"
          aria-label="Your account and settings"
          tabIndex={-1}
          style={{ left: pos.left, bottom: pos.bottom, width: MENU_WIDTH, maxHeight: pos.maxHeight }}
          className="fixed z-[60] overflow-y-auto rounded-xl border border-gray-200 bg-white text-gray-700 shadow-2xl focus:outline-none"
        >
          {/* Who you are, again, so the menu makes sense on the rail too,
              where the button beside it is only a picture. */}
          <div className="flex items-center gap-3 px-4 pb-3 pt-4">
            <UserAvatar photoPath={profile?.photoPath} fallback={fallback} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">{name}</p>
              <p className="truncate text-xs text-gray-500">{user?.email}</p>
            </div>
          </div>

          <div className="px-2 pb-2">
            <MenuLink
              href="/dashboard/profile"
              icon={UserRound}
              label="My profile"
              hint="Your details, and how to ask for a change"
              current={onProfile}
            />
            {/* Only with Learn English on: it matters to nobody else, and a
                link everybody sees for a feature most never use is noise. */}
            {learnOn && (
              <MenuLink
                href="/dashboard/words"
                icon={BookMarked}
                label="My words"
                hint="The words you saved to study"
                current={onWords}
              />
            )}
          </div>

          <Section title="Appearance">
            <Segmented
              label="Theme"
              ariaLabel="Colour theme"
              options={THEME_CHOICES.map((v) => ({ value: v, ...THEME_OPTIONS[v] }))}
              value={theme}
              onChange={setTheme}
            />
            {/* Desktop only: below `lg` the sidebar is a drawer, and none of
                the three means anything there. */}
            <div className="mt-3 hidden lg:block">
              <Segmented
                label="Sidebar"
                ariaLabel="How the sidebar sits"
                options={SIDEBAR_MODES.map((v) => ({ value: v, ...SIDEBAR_OPTIONS[v] }))}
                value={sidebarMode}
                onChange={onSidebarMode}
              />
            </div>
          </Section>

          <Section title="Language">
            {/* English stays on screen either way; this only adds the Spanish.
                "ES" rather than a flag: a flag is a country, not a language. */}
            <ToggleRow
              icon={<span aria-hidden className="w-4 text-center text-[11px] font-bold leading-none">ES</span>}
              label="Spanish"
              hint="Spanish under the English"
              on={spanishOn}
              onChange={setSpanishOn}
            />
            <ToggleRow
              icon={<Languages size={16} aria-hidden />}
              label="Learn English"
              hint="Meanings of English words in Spanish"
              on={learnOn}
              onChange={setLearnOn}
            />
          </Section>

          <div className="border-t border-gray-100 p-2">
            <button
              type="button"
              role="menuitem"
              onClick={() => { close(false); logout(); }}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm text-gray-700 transition hover:bg-red-50 hover:text-red-700 focus:outline-none focus-visible:bg-red-50 focus-visible:text-red-700"
            >
              <LogOut size={16} aria-hidden />
              <span data-es>Sign out</span>
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function MenuLink({
  href, icon: Icon, label, hint, current,
}: { href: string; icon: LucideIcon; label: string; hint: string; current: boolean }) {
  return (
    <Link
      href={href}
      role="menuitem"
      aria-current={current ? 'page' : undefined}
      className={`flex items-start gap-3 rounded-lg px-2 py-2 transition focus:outline-none focus-visible:bg-gray-100 ${
        current ? 'bg-gray-100' : 'hover:bg-gray-50'
      }`}
    >
      <Icon size={16} aria-hidden className="mt-0.5 flex-shrink-0 text-gray-500" />
      <span className="min-w-0">
        <span data-es className="block text-sm font-medium text-gray-900">{label}</span>
        <span data-es className="block text-xs text-gray-500">{hint}</span>
      </span>
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-gray-100 px-4 py-3">
      <p data-es className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{title}</p>
      {children}
    </div>
  );
}

/** A labelled row of choices, icon above word, so no option is a guess. */
function Segmented<T extends string>({
  label, ariaLabel, options, value, onChange,
}: {
  label: string;
  ariaLabel: string;
  options: { value: T; icon: LucideIcon; label: string; title: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div>
      <p data-es className="mb-1.5 text-xs font-medium text-gray-600">{label}</p>
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className="grid gap-1 rounded-lg bg-gray-100 p-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map(({ value: v, icon: Icon, label: text, title }) => {
          const active = v === value;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={active}
              title={title}
              onClick={() => onChange(v)}
              className={`flex flex-col items-center gap-1 rounded-md px-1 py-1.5 text-[11px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                active
                  ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <Icon size={16} aria-hidden />
              <span data-es>{text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A whole row that flips a switch — the label is the target, not just the pill. */
function ToggleRow({
  icon, label, hint, on, onChange,
}: { icon: React.ReactNode; label: string; hint: string; on: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-100"
    >
      <span className="flex w-4 flex-shrink-0 justify-center text-gray-500">{icon}</span>
      <span className="min-w-0 flex-1">
        <span data-es className="block text-sm font-medium text-gray-900">{label}</span>
        <span data-es className="block text-xs text-gray-500">{hint}</span>
      </span>
      <span
        aria-hidden
        className={`relative h-5 w-9 flex-shrink-0 rounded-full transition ${on ? 'bg-brand-500' : 'bg-gray-300'}`}
      >
        {/* A literal white: `bg-white` means "the page colour", which dark
            mode turns near-black. */}
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-[#ffffff] shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`}
        />
      </span>
    </button>
  );
}
