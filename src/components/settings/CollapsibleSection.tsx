'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { REVEAL_ANCHOR_EVENT } from './settingsSections';

/**
 * A settings panel that folds shut, with its own heading and blurb.
 *
 * The People tab is three of these stacked — a form, a directory and an
 * archive — and only one of them is what any given visit is about. Sub-tabs
 * were the other option and were rejected: the Overview cards, the search box
 * and the "jump to this person" results all deep-link by URL hash, and every
 * one of those links would have had to learn which sub-tab to switch to first.
 * A section that opens itself when the hash points inside it keeps all of that
 * working, and a second row of tabs under an already sticky tab bar is a good
 * way to lose track of where you are.
 *
 * Children are not rendered while it is shut. That is what lets a panel do its
 * own fetching on first open (see `onOpen`) rather than on every visit to the
 * tab, which is how the removal log has always behaved.
 */

/** Per-browser, not per-account: this is a preference about one screen. */
const storageKey = (id: string) => `ttms.settings.section.${id}`;

export default function CollapsibleSection({
  id,
  title,
  description,
  Icon,
  aside,
  anchorPrefix,
  defaultOpen = false,
  onOpen,
  className = '',
  children,
}: {
  /** Element id and hash target — must match the `SETTINGS_SECTIONS` entry. */
  id: string;
  title: string;
  description?: ReactNode;
  Icon?: LucideIcon;
  /**
   * Sits at the right of the header, outside the toggle: a count, or in Add
   * People's case its mode switch. Anything clickable has to live here rather
   * than in the button, or clicking it would fold the section away.
   */
  aside?: ReactNode;
  /**
   * Opens this section for any anchor starting with this, not just its own id
   * — the people list holds one anchor per person, and a search result jumps
   * straight at a row inside it.
   */
  anchorPrefix?: string;
  defaultOpen?: boolean;
  /**
   * Called when it opens, for a panel that loads its rows on demand. May fire
   * on a section that is already open, so it has to be safe to call twice.
   */
  onOpen?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  /** Guards the settling below, which must happen on arrival and never again. */
  const settled = useRef(false);

  const show = useCallback(() => {
    setOpen(true);
    onOpen?.();
  }, [onOpen]);

  const owns = useCallback(
    (anchor: string) => anchor === id || (!!anchorPrefix && anchor.startsWith(anchorPrefix)),
    [id, anchorPrefix],
  );

  // Settle the open state on arrival: the remembered choice first, then the
  // hash on top of it, because someone who followed a link to this section
  // means to see it however they left it last time.
  //
  // Read here rather than as the initial state because this renders on the
  // server too, where there is no localStorage, and seeding from it would
  // hydrate to a different shape than the server sent. Once only, or a later
  // re-run would re-open a section the reader had just folded away — the hash
  // stays in the address bar long after the jump.
  useEffect(() => {
    if (settled.current) return;
    settled.current = true;

    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(storageKey(id));
    } catch {
      // Private browsing, or storage switched off. The default stands.
    }
    if (saved === 'open') show();
    else if (saved === 'closed') setOpen(false);

    if (owns(decodeURIComponent(window.location.hash.slice(1)))) show();
  }, [id, owns, show]);

  // Everything that jumps to an anchor announces it first — see
  // scrollToAnchor. A jump within the tab you are already on is a pushState,
  // which fires no hashchange, so this event is the only notice of it.
  useEffect(() => {
    const onReveal = (e: Event) => {
      if (owns((e as CustomEvent<string>).detail)) show();
    };
    window.addEventListener(REVEAL_ANCHOR_EVENT, onReveal);
    return () => window.removeEventListener(REVEAL_ANCHOR_EVENT, onReveal);
  }, [owns, show]);

  function toggle() {
    const next = !open;
    if (next) show();
    else setOpen(false);
    settled.current = true;
    try {
      window.localStorage.setItem(storageKey(id), next ? 'open' : 'closed');
    } catch {
      // Not remembering the choice is a smaller problem than a thrown error.
    }
  }

  const panelId = `${id}-panel`;

  return (
    <section
      id={id}
      /* overflow-hidden so the header's hover tint is clipped by the rounded
         corners instead of squaring them off. */
      className={`scroll-mt-44 overflow-hidden rounded-xl border border-gray-200 bg-white ${className}`}
    >
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="group flex min-w-0 flex-1 items-start gap-3 px-6 py-4 text-left transition hover:bg-gray-50"
        >
          <span className="mt-0.5 flex-shrink-0 text-gray-400 transition group-hover:text-gray-600">
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
          <span className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              {Icon && <Icon size={14} className="text-gray-400" />}
              {title}
            </h2>
            {description && <div className="mt-0.5 text-xs text-gray-500">{description}</div>}
          </span>
        </button>

        {aside && <div className="flex-shrink-0 py-4 pr-6">{aside}</div>}
      </div>

      {open && (
        <div id={panelId} className="border-t border-gray-100">
          {children}
        </div>
      )}
    </section>
  );
}
