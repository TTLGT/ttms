'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Apple, Car, Clock, Flag, Hand, Hash, Lightbulb, Loader2, PawPrint, Search, Smile, Trophy,
  type LucideIcon,
} from 'lucide-react';
import {
  loadEmoji, matchesSearch, recentEmoji, rememberEmoji, setSkinTone, skinTone, withTone,
  type EmojiGroup, type EmojiRow,
} from '@/lib/emoji';

/**
 * The full emoji picker, shared by reactions and the message box.
 *
 * Positioned against the viewport rather than its button, for the reason the
 * quick-reaction row and PersonCard are: the thread scrolls and clips, and the
 * popup chat clips harder, so a picker anchored inside it is cut off the moment
 * it opens near an edge. It brings its own full-screen click catcher for the
 * same reason the quick row does.
 */

/** One icon per tab, in the order the build script writes the groups. */
const GROUP_ICONS: LucideIcon[] = [Smile, Hand, PawPrint, Apple, Car, Trophy, Lightbulb, Hash, Flag];

const TONE_SWATCH = ['✋', '✋🏻', '✋🏼', '✋🏽', '✋🏾', '✋🏿'];

const WIDTH = 344;
const HEIGHT = 400;

/** Most search results shown. Past this the answer is "type more", not "scroll". */
const MAX_RESULTS = 180;

export default function EmojiPicker({
  anchor,
  onPick,
  onClose,
  closeOnPick = true,
}: {
  /** Where the button that opened it was, when it was pressed. */
  anchor: DOMRect;
  onPick: (glyph: string) => void;
  onClose: () => void;
  /**
   * A reaction is one emoji, so the picker goes once it is chosen. The message
   * box leaves it open: "🚚💨" is two picks, and reopening the picker between
   * them is a nuisance.
   */
  closeOnPick?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const sections = useRef<(HTMLElement | null)[]>([]);

  const [placement, setPlacement] = useState<{ left: number; top: number } | null>(null);
  const [groups, setGroups]   = useState<EmojiGroup[] | null>(null);
  const [failed, setFailed]   = useState(false);
  const [query, setQuery]     = useState('');
  const [tone, setTone]       = useState(0);
  const [toneOpen, setToneOpen] = useState(false);
  const [recent, setRecent]   = useState<string[]>([]);
  const [hovered, setHovered] = useState<{ glyph: string; name: string } | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    setTone(skinTone());
    setRecent(recentEmoji());
    let live = true;
    loadEmoji()
      .then((g) => { if (live) setGroups(g); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  useLayoutEffect(() => {
    const margin = 8;
    let left = Math.min(anchor.left, window.innerWidth - WIDTH - margin);
    left = Math.max(margin, left);
    // Above the button by preference — the message box sits at the bottom of
    // the screen, and a reaction should not cover the message it is on.
    let top = anchor.top - HEIGHT - 6;
    if (top < margin) top = Math.min(anchor.bottom + 6, window.innerHeight - HEIGHT - margin);
    setPlacement({ left, top: Math.max(margin, top) });
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  /** The name to show for a recent pick, looked up rather than stored. */
  const nameOf = useMemo(() => {
    const names = new Map<string, string>();
    for (const g of groups ?? []) {
      for (const row of g.emoji) {
        names.set(row.e, row.n);
        row.s?.forEach((s) => names.set(s, row.n));
      }
    }
    return names;
  }, [groups]);

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0 || !groups) return null;
    const hits: EmojiRow[] = [];
    for (const g of groups) {
      for (const row of g.emoji) {
        if (matchesSearch(row, words)) hits.push(row);
        if (hits.length >= MAX_RESULTS) return hits;
      }
    }
    return hits;
  }, [query, groups]);

  function pick(glyph: string) {
    rememberEmoji(glyph);
    setRecent(recentEmoji());
    onPick(glyph);
    if (closeOnPick) onClose();
  }

  function chooseTone(t: number) {
    setTone(t);
    setSkinTone(t);
    setToneOpen(false);
  }

  function jumpTo(i: number) {
    setQuery('');
    // After the search clears and the sections are back on the page.
    window.requestAnimationFrame(() => {
      const el = sections.current[i];
      if (el && scroller.current) scroller.current.scrollTop = el.offsetTop;
    });
  }

  function trackTab() {
    const top = (scroller.current?.scrollTop ?? 0) + 4;
    let at = 0;
    sections.current.forEach((el, i) => { if (el && el.offsetTop <= top) at = i; });
    setActiveTab(at);
  }

  /*
   * Section 0 is "Recently used" when there is one, so group i is section i+1
   * then. Kept as one list so the tab highlight is a single index.
   */
  const hasRecent = recent.length > 0;
  const offset = hasRecent ? 1 : 0;

  const cell = (glyph: string, name: string, key: string) => (
    <button
      key={key}
      type="button"
      title={name}
      // onMouseDown, not onClick, for the message box's sake: a click would
      // blur the text box first. The picker catches the event itself so the
      // caret stays where the person left it.
      onMouseDown={(e) => { e.preventDefault(); pick(glyph); }}
      onMouseEnter={() => setHovered({ glyph, name })}
      className="flex h-8 w-8 items-center justify-center rounded-md text-[22px] leading-none transition hover:bg-gray-100"
    >
      {glyph}
    </button>
  );

  return (
    <>
      <div className="fixed inset-0 z-30" onMouseDown={onClose} />
      <div
        ref={box}
        role="dialog"
        aria-label="Emoji"
        style={{
          left: placement?.left ?? anchor.left,
          top:  placement?.top ?? anchor.top,
          width: WIDTH,
          height: HEIGHT,
          visibility: placement ? 'visible' : 'hidden',
        }}
        className="fixed z-40 flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
      >
        <div className="flex-shrink-0 border-b border-gray-100 p-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && results && results.length > 0) {
                  e.preventDefault();
                  pick(withTone(results[0], tone));
                }
              }}
              placeholder="Search emoji"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-2 text-sm focus:border-brand-400 focus:bg-white focus:outline-none"
            />
          </div>
          {!results && (
            <div className="mt-1.5 flex justify-between">
              {hasRecent && (
                <TabButton icon={Clock} label="Recently used" active={activeTab === 0} onClick={() => jumpTo(0)} />
              )}
              {(groups ?? []).map((g, i) => (
                <TabButton
                  key={g.label}
                  icon={GROUP_ICONS[i] ?? Smile}
                  label={g.label}
                  active={activeTab === i + offset}
                  onClick={() => jumpTo(i + offset)}
                />
              ))}
            </div>
          )}
        </div>

        <div ref={scroller} onScroll={trackTab} className="relative min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {failed ? (
            <p className="p-4 text-center text-xs text-gray-500">
              The emoji list did not load. Close this and try again.
            </p>
          ) : !groups ? (
            <div className="flex h-full items-center justify-center text-gray-400">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : results ? (
            results.length === 0 ? (
              <p className="p-4 text-center text-xs text-gray-500">No emoji match “{query}”.</p>
            ) : (
              <div className="grid grid-cols-9 gap-0.5 pt-2">
                {results.map((row) => cell(withTone(row, tone), row.n, row.e))}
              </div>
            )
          ) : (
            <>
              {hasRecent && (
                <section ref={(el) => { sections.current[0] = el; }}>
                  <SectionHeading>Recently used</SectionHeading>
                  <div className="grid grid-cols-9 gap-0.5">
                    {recent.map((glyph) => cell(glyph, nameOf.get(glyph) ?? '', `r-${glyph}`))}
                  </div>
                </section>
              )}
              {groups.map((g, i) => (
                <section
                  key={g.label}
                  ref={(el) => { sections.current[i + offset] = el; }}
                  // The browser skips laying out tabs nobody has scrolled to.
                  // Nineteen hundred buttons are fine to render, but there is
                  // no need to pay for all of them on the first frame.
                  style={{ contentVisibility: 'auto', containIntrinsicSize: `auto ${Math.ceil(g.emoji.length / 9) * 34 + 28}px` }}
                >
                  <SectionHeading>{g.label}</SectionHeading>
                  <div className="grid grid-cols-9 gap-0.5">
                    {g.emoji.map((row) => cell(withTone(row, tone), row.n, row.e))}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>

        <div className="flex h-11 flex-shrink-0 items-center gap-2 border-t border-gray-100 px-3">
          {hovered ? (
            <>
              <span className="text-2xl leading-none">{hovered.glyph}</span>
              <span className="min-w-0 flex-1 truncate text-xs capitalize text-gray-600">{hovered.name}</span>
            </>
          ) : (
            <span className="flex-1 text-xs text-gray-400">Pick an emoji</span>
          )}
          <div className="relative">
            {toneOpen ? (
              <div className="flex gap-0.5 rounded-full border border-gray-200 bg-white px-1 py-0.5">
                {TONE_SWATCH.map((swatch, t) => (
                  <button
                    key={t}
                    type="button"
                    title={t === 0 ? 'Default' : `Skin tone ${t}`}
                    onMouseDown={(e) => { e.preventDefault(); chooseTone(t); }}
                    className={`rounded-full px-0.5 text-lg leading-none transition hover:scale-125 ${t === tone ? 'bg-brand-50' : ''}`}
                  >
                    {swatch}
                  </button>
                ))}
              </div>
            ) : (
              <button
                type="button"
                title="Skin tone"
                onMouseDown={(e) => { e.preventDefault(); setToneOpen(true); }}
                className="rounded-md p-1 text-lg leading-none transition hover:bg-gray-100"
              >
                {TONE_SWATCH[tone]}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function TabButton({
  icon: Icon, label, active, onClick,
}: { icon: LucideIcon; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={`rounded-md p-1.5 transition ${
        active ? 'bg-brand-50 text-brand-700' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
      }`}
    >
      <Icon size={15} />
    </button>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="sticky top-0 z-10 bg-white/95 px-1 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
      {children}
    </h3>
  );
}
