'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSpanish } from '@/context/SpanishContext';

/*
 * The Spanish bubble for small things. Any element carrying `data-es` gets
 * one on hover: `data-es="Save"` looks that phrase up, and a bare `data-es`
 * uses the element's own text — which is what most buttons want.
 *
 * One listener on the document rather than a wrapper per button, for three
 * reasons:
 *
 *  - **Server components can use it.** An attribute needs no hook, so a badge
 *    rendered anywhere gets the bubble without becoming a client component.
 *  - **It costs English users nothing.** The listener is attached only while
 *    the switch is on; with it off, `data-es` is an inert attribute.
 *  - **It is never clipped.** The bubble is portalled to <body> and placed
 *    with fixed coordinates, so a table cell or the sidebar with
 *    `overflow: hidden` cannot cut it off, and no layout moves to make room.
 *
 * Touch screens have no hover, and tapping a button presses it, so phones
 * get no bubble. Agreed when this was asked for: TTMS is used at a desk.
 *
 * It never edits the element it describes — same rule as LearnLayer: React
 * owns those nodes.
 */

const DELAY_MS = 350;
const GAP = 6;

interface Bubble { text: string; x: number; y: number; above: boolean }

/*
 * What to translate under the pointer. Tagging every element by hand missed
 * most of the app: a button reading `{saving ? 'Saving…' : 'Save'}`, a
 * dropdown's options, a placeholder, a status chip built from a stored value —
 * none of them is fixed text a script can find. So the bubble reads what is
 * actually on screen and looks that up, and `data-es` is only needed where
 * the visible text is not the dictionary key.
 *
 * Tried in order, first hit wins:
 *  1. `data-es` on the element or an ancestor — an explicit key.
 *  2. The element under the pointer itself, when its text is short — a chip,
 *     a label, a table cell, a sentence in a <p>.
 *  3. The nearest control around it — a button, link, tab, column heading,
 *     label — by its whole text.
 *  4. A dropdown by its chosen option, a text box by its placeholder.
 *
 * A miss costs one dictionary lookup per element entered, so this is cheap.
 * Typed content (names, notes, chat) is looked up too and simply is not in
 * the dictionary, which is what keeps it untranslated.
 */
const CONTROLS = 'button, a, th, label, summary, [role="tab"], [role="button"], [role="menuitem"], legend';
const MAX_TEXT = 400;

type Lookup = (english: string) => string | null;

function findSpanish(start: Element | null, es: Lookup): { el: Element; spanish: string } | null {
  if (!start || !(start instanceof Element)) return null;

  const tagged = start.closest('[data-es]');
  if (tagged) {
    const key = tagged.getAttribute('data-es') || tagged.textContent || '';
    const spanish = es(key);
    if (spanish) return { el: tagged, spanish };
  }

  if (start instanceof HTMLSelectElement) {
    const text = start.selectedOptions[0]?.textContent ?? '';
    const spanish = text ? es(text) : null;
    return spanish ? { el: start, spanish } : null;
  }
  if (start instanceof HTMLInputElement || start instanceof HTMLTextAreaElement) {
    const spanish = start.placeholder && !start.value ? es(start.placeholder) : null;
    return spanish ? { el: start, spanish } : null;
  }

  // Never inside our own Spanish: hovering a Spanish line should not bubble.
  if (start.closest('[lang="es"]')) return null;

  const own = start.textContent ?? '';
  if (own && own.length <= MAX_TEXT) {
    const spanish = es(own);
    if (spanish) return { el: start, spanish };
  }

  const control = start.closest(CONTROLS);
  if (control && control !== start) {
    const text = control.textContent ?? '';
    const spanish = text.length <= MAX_TEXT ? es(text) : null;
    if (spanish) return { el: control, spanish };
  }
  return null;
}

export default function SpanishTips() {
  const { on, es } = useSpanish();
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const timer = useRef<number | null>(null);
  const target = useRef<Element | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  // Where the bubble's left edge goes once its width is known: centred on the
  // element, but never closer than 8px to either side of the window.
  const [left, setLeft] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!bubble || !box.current) { setLeft(null); return; }
    const w = box.current.offsetWidth;
    setLeft(Math.max(8, Math.min(bubble.x - w / 2, window.innerWidth - w - 8)));
  }, [bubble]);

  useEffect(() => {
    if (!on) { setBubble(null); return; }

    const clear = () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      target.current = null;
      setBubble(null);
    };

    const onOver = (e: MouseEvent) => {
      const found = findSpanish(e.target as Element | null, es);
      const el = found?.el ?? null;
      if (el === target.current) return;
      clear();
      if (!found || !el) return;
      const spanish = found.spanish;
      target.current = el;
      timer.current = window.setTimeout(() => {
        if (target.current !== el || !el.isConnected) return;
        const r = el.getBoundingClientRect();
        // Below unless that would run off the bottom of the window.
        const above = r.bottom + 40 > window.innerHeight;
        setBubble({
          text: spanish,
          x: r.left + r.width / 2,
          y: above ? r.top - GAP : r.bottom + GAP,
          above,
        });
      }, DELAY_MS);
    };

    // Leaving the window entirely fires no mouseover on anything new.
    const onOut = (e: MouseEvent) => { if (!e.relatedTarget) clear(); };

    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);
    // A click or a scroll moves things; a bubble left floating would point at
    // whatever is under it now.
    document.addEventListener('mousedown', clear, true);
    window.addEventListener('scroll', clear, true);
    return () => {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
      document.removeEventListener('mousedown', clear, true);
      window.removeEventListener('scroll', clear, true);
      clear();
    };
  }, [on, es]);

  if (!bubble) return null;

  return createPortal(
    <div
      lang="es"
      data-learn-skip
      role="tooltip"
      ref={box}
      style={{
        position: 'fixed',
        left: left ?? 0,
        top: bubble.y,
        transform: bubble.above ? 'translateY(-100%)' : undefined,
        // Hidden for the one frame it takes to measure its width.
        visibility: left === null ? 'hidden' : 'visible',
        maxWidth: 'min(18rem, calc(100vw - 16px))',
      }}
      // A literal dark ground: bg-gray-900 is one of the families dark mode
      // inverts, and the bubble should read the same in every theme.
      className="pointer-events-none z-[1000] rounded-md bg-[#1f2937] px-2 py-1 text-xs font-medium leading-snug text-[#f9fafb] shadow-lg"
    >
      {bubble.text}
    </div>,
    document.body,
  );
}
