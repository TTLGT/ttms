'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Check, Languages, Volume2, X } from 'lucide-react';
import { useLearn } from '@/context/LearnContext';
import { findGlossaryWords } from '@/lib/glossaryMatch';
import { canSpeak, speak } from '@/lib/speak';
import { GLOSSARY_BY_ID } from '@/types/glossary';

/**
 * Learn English, on screen: a dotted underline under every glossary word, and
 * a card with its meaning when somebody hovers, taps or selects one.
 *
 * **Nothing here changes the page's DOM.** The obvious way to underline a word
 * is to wrap it in a <span>, and on a React page that is a trap: React keeps
 * hold of the text node it rendered, so splitting it leaves React updating a
 * node that is no longer on screen — the order number changes and the page
 * keeps showing the old one — and removing it later throws. Instead:
 *
 *  - the underline is the CSS Custom Highlight API: Range objects handed to
 *    the browser to paint, styled by `::highlight(ttms-learn)` in globals.css;
 *  - finding the word under the pointer asks the browser for the caret
 *    position at that point and looks it up in the same list of Ranges.
 *
 * A browser without the Highlight API gets no underline but still gets the
 * card, because the lookup does not depend on it.
 *
 * The page is re-read whenever it changes (a MutationObserver, debounced),
 * since every list, every order and every chat message arrives after the first
 * paint. The walk skips inputs, text areas and code, which are not reading
 * material, and the card itself, which is marked `data-learn-skip`.
 */

const HIGHLIGHT = 'ttms-learn';
const HIGHLIGHT_ACTIVE = 'ttms-learn-active';
const SKIP = 'script,style,noscript,textarea,input,select,option,code,pre,svg,'
  + '[contenteditable="true"],[contenteditable=""],[data-learn-skip]';
/** Tapping these does something, so a tap on a word inside one is left to do it. */
const INTERACTIVE = 'a,button,input,select,textarea,label,summary,'
  + '[role="button"],[role="link"],[role="menuitem"],[role="tab"],[role="radio"],[role="checkbox"]';
/** A ceiling on underlines, so a very long chat history cannot make a re-read slow. */
const MAX_HITS = 4000;
const RESCAN_MS = 350;
const OPEN_DELAY_MS = 300;
const CLOSE_DELAY_MS = 250;
/** How long a card must stay open on hover before it counts as a lookup. */
const DWELL_MS = 800;
const GUTTER = 8;

interface Hit {
  node: Text;
  start: number;
  end: number;
  termId: string;
  range: Range;
}

interface Active {
  hit: Hit;
  rect: { left: number; top: number; bottom: number };
}

function highlightsSupported(): boolean {
  return typeof Highlight !== 'undefined' && typeof CSS !== 'undefined' && 'highlights' in CSS;
}

function inSkipped(node: Node | null): boolean {
  const el = node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);
  return !!el?.closest('[data-learn-skip]');
}

/** The text node and offset under a point, in whichever spelling this browser has. */
function caretAt(x: number, y: number): { node: Text; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos && pos.offsetNode.nodeType === Node.TEXT_NODE) {
      return { node: pos.offsetNode as Text, offset: pos.offset };
    }
    return null;
  }
  if (doc.caretRangeFromPoint) {
    const range = doc.caretRangeFromPoint(x, y);
    if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
      return { node: range.startContainer as Text, offset: range.startOffset };
    }
  }
  return null;
}

export default function LearnLayer() {
  const { enabled } = useLearn();
  // Mounted only while on, so turning it off tears down every listener and
  // the observer rather than leaving them running behind a flag.
  return enabled ? <ActiveLayer /> : null;
}

function ActiveLayer() {
  const { words, recordLookup, setKnown } = useLearn();
  const [active, setActive] = useState<Active | null>(null);

  const index = useRef(new Map<Text, Hit[]>());
  const activeRef = useRef<Active | null>(null);
  const overCard = useRef(false);
  const timers = useRef<{ open?: number; close?: number; dwell?: number }>({});

  const known = useMemo(
    () => new Set(Object.entries(words ?? {}).filter(([, w]) => w.known).map(([id]) => id)),
    [words],
  );

  // ── Reading the page ──────────────────────────────────────────────────────

  const scan = useCallback(() => {
    const next = new Map<Text, Hit[]>();
    const ranges: Range[] = [];

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const text = (node as Text).data;
        if (text.length < 2 || !/\p{L}/u.test(text)) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || parent.closest(SKIP)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    for (let node = walker.nextNode(); node && ranges.length < MAX_HITS; node = walker.nextNode()) {
      const text = node as Text;
      const hits: Hit[] = [];
      for (const found of findGlossaryWords(text.data)) {
        if (known.has(found.termId)) continue;
        const range = document.createRange();
        range.setStart(text, found.start);
        range.setEnd(text, found.end);
        ranges.push(range);
        hits.push({ ...found, node: text, range });
      }
      if (hits.length > 0) next.set(text, hits);
    }

    index.current = next;
    if (highlightsSupported()) CSS.highlights.set(HIGHLIGHT, new Highlight(...ranges));

    // The word the card is about may have been re-rendered away — a list that
    // refreshed under the pointer. A card pointing at nothing is closed.
    const current = activeRef.current;
    if (current && !current.hit.node.isConnected) hide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [known]);

  useEffect(() => {
    scan();
    let pending: number | undefined;
    const observer = new MutationObserver((records) => {
      // The card changing is not the page changing.
      if (records.every((r) => inSkipped(r.target))) return;
      window.clearTimeout(pending);
      pending = window.setTimeout(scan, RESCAN_MS);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      window.clearTimeout(pending);
    };
  }, [scan]);

  useEffect(() => () => {
    if (highlightsSupported()) {
      CSS.highlights.delete(HIGHLIGHT);
      CSS.highlights.delete(HIGHLIGHT_ACTIVE);
    }
    const t = timers.current;
    window.clearTimeout(t.open);
    window.clearTimeout(t.close);
    window.clearTimeout(t.dwell);
  }, []);

  // ── Opening and closing the card ──────────────────────────────────────────

  const hitAt = useCallback((x: number, y: number): Hit | null => {
    const pos = caretAt(x, y);
    if (!pos) return null;
    const hits = index.current.get(pos.node);
    if (!hits) return null;
    for (const hit of hits) {
      if (pos.offset < hit.start || pos.offset > hit.end) continue;
      // The caret snaps to the nearest letter even when the pointer is in the
      // blank space past the end of a line, so check the pointer is really on
      // the word.
      for (const r of Array.from(hit.range.getClientRects())) {
        if (x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1) return hit;
      }
    }
    return null;
  }, []);

  function hide() {
    const t = timers.current;
    window.clearTimeout(t.close);
    window.clearTimeout(t.dwell);
    activeRef.current = null;
    overCard.current = false;
    setActive(null);
    if (highlightsSupported()) CSS.highlights.delete(HIGHLIGHT_ACTIVE);
  }

  const open = useCallback((hit: Hit, deliberate: boolean) => {
    const t = timers.current;
    window.clearTimeout(t.close);
    window.clearTimeout(t.dwell);

    const box = hit.range.getBoundingClientRect();
    const next: Active = { hit, rect: { left: box.left, top: box.top, bottom: box.bottom } };
    activeRef.current = next;
    setActive(next);
    if (highlightsSupported()) CSS.highlights.set(HIGHLIGHT_ACTIVE, new Highlight(hit.range));

    // A tap or a selection is a clear "what does this mean?". A hover might be
    // the pointer passing through on its way somewhere, so it counts only once
    // the card has stayed open long enough to be read.
    if (deliberate) recordLookup(hit.termId);
    else t.dwell = window.setTimeout(() => recordLookup(hit.termId), DWELL_MS);
  }, [recordLookup]);

  const scheduleHide = useCallback(() => {
    const t = timers.current;
    window.clearTimeout(t.close);
    t.close = window.setTimeout(() => { if (!overCard.current) hide(); }, CLOSE_DELAY_MS);
  }, []);

  // Hover, with a mouse.
  useEffect(() => {
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const target = e.target as Node | null;
      if (inSkipped(target)) return;
      const { clientX: x, clientY: y } = e;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const t = timers.current;
        const hit = hitAt(x, y);
        if (hit && activeRef.current?.hit === hit) {
          window.clearTimeout(t.close);
          return;
        }
        window.clearTimeout(t.open);
        if (hit) t.open = window.setTimeout(() => open(hit, false), OPEN_DELAY_MS);
        else if (activeRef.current) scheduleHide();
      });
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      document.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
    };
  }, [hitAt, open, scheduleHide]);

  // A tap, on a phone or with a pen. Words on a button or a link are left
  // alone — the tap is for the button — and are reachable by pressing and
  // holding to select them, below.
  useEffect(() => {
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const target = e.target as Element | null;
      if (inSkipped(target)) return;
      const hit = hitAt(e.clientX, e.clientY);
      if (hit && !target?.closest(INTERACTIVE)) open(hit, true);
      else if (activeRef.current) hide();
    };
    document.addEventListener('pointerup', onUp);
    return () => document.removeEventListener('pointerup', onUp);
  }, [hitAt, open]);

  // Selecting a word — a double-click, or press-and-hold on a phone — opens
  // its card. That is also the way to reach a word inside a button.
  useEffect(() => {
    let pending: number | undefined;
    const onSelection = () => {
      window.clearTimeout(pending);
      pending = window.setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
        // A whole paragraph selected to copy is not a question about a word.
        if (sel.toString().trim().length > 60) return;
        const range = sel.getRangeAt(0);
        if (inSkipped(range.commonAncestorContainer)) return;
        if (range.startContainer.nodeType !== Node.TEXT_NODE) return;
        const hits = index.current.get(range.startContainer as Text);
        const endOffset = range.endContainer === range.startContainer ? range.endOffset : Infinity;
        const hit = hits?.find((h) => h.start < endOffset && h.end > range.startOffset);
        if (hit) open(hit, true);
      }, 250);
    };
    document.addEventListener('selectionchange', onSelection);
    return () => {
      document.removeEventListener('selectionchange', onSelection);
      window.clearTimeout(pending);
    };
  }, [open]);

  // Anything that moves the page moves the word out from under the card.
  useEffect(() => {
    if (!active) return;
    const onScroll = (e: Event) => { if (!inSkipped(e.target as Node)) hide(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', hide);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) return null;
  return createPortal(
    <WordCard
      active={active}
      onEnter={() => { overCard.current = true; window.clearTimeout(timers.current.close); }}
      onLeave={() => { overCard.current = false; scheduleHide(); }}
      onSpeak={() => recordLookup(active.hit.termId)}
      onKnown={() => { setKnown(active.hit.termId, true); hide(); }}
      onClose={hide}
    />,
    document.body,
  );
}

function WordCard({ active, onEnter, onLeave, onSpeak, onKnown, onClose }: {
  active: Active;
  onEnter: () => void;
  onLeave: () => void;
  onSpeak: () => void;
  onKnown: () => void;
  onClose: () => void;
}) {
  const term = GLOSSARY_BY_ID.get(active.hit.termId);
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });

  // Below the word, or above it when there is no room below; never off the
  // side of a phone screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.max(GUTTER, Math.min(active.rect.left, window.innerWidth - width - GUTTER));
    const below = active.rect.bottom + 6;
    const top = below + height + GUTTER <= window.innerHeight
      ? below
      : Math.max(GUTTER, active.rect.top - height - 6);
    setStyle({ left, top });
  }, [active]);

  if (!term) return null;
  const voice = canSpeak();

  return (
    <div
      ref={ref}
      data-learn-skip
      role="dialog"
      aria-label={`Meaning of ${term.word}`}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      style={style}
      className="fixed z-[1000] w-[min(20rem,calc(100vw-16px))] rounded-xl border border-gray-200 bg-white p-4 text-left text-gray-900 shadow-xl"
    >
      <div className="flex items-start gap-2">
        <p className="flex-1 text-lg font-semibold leading-tight">{term.word}</p>
        {voice && (
          <button
            type="button"
            onClick={() => { speak(term.word); onSpeak(); }}
            title="Say it"
            aria-label={`Say ${term.word}`}
            className="rounded-lg p-1.5 text-brand-600 transition hover:bg-brand-50"
          >
            <Volume2 size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
        >
          <X size={16} />
        </button>
      </div>

      <p className="mt-1 text-sm">
        <span className="text-gray-500">Español: </span>
        <span className="font-medium">{term.es}</span>
      </p>
      <p className="mt-2 text-sm text-gray-700">{term.meaning}</p>

      <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-gray-50 px-2.5 py-2">
        <p className="flex-1 text-sm italic text-gray-600">{term.example}</p>
        {voice && (
          <button
            type="button"
            onClick={() => { speak(term.example, true); onSpeak(); }}
            title="Say the example, slowly"
            aria-label="Say the example"
            className="rounded p-1 text-gray-400 transition hover:text-brand-600"
          >
            <Volume2 size={14} />
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-3">
        <button
          type="button"
          onClick={onKnown}
          title="Stop underlining this word. You can undo it on the My words page."
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-green-700 transition hover:bg-green-50"
        >
          <Check size={14} />
          I know this word
        </button>
        <Link
          href="/dashboard/words"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline"
        >
          <Languages size={14} />
          My words
        </Link>
      </div>
    </div>
  );
}
