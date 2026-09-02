'use client';

import { useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';

/**
 * A value with a copy button beside it.
 *
 * The directory is mostly read to get something *out* of it — an address into
 * an email, an extension into a phone system, a number into a dialler — and
 * selecting a wrapping line of small grey text with a mouse is the fiddliest
 * possible way to do that. The button takes the exact value, not whatever the
 * selection happened to catch.
 *
 * Wraps the value rather than sitting loose next to it, because of the
 * fallback: when the clipboard is unavailable this selects the text for the
 * reader to copy by hand, and it can only do that if it holds a reference to
 * the thing it is copying. The office reaches TTMS over plain http, where
 * `navigator.clipboard` does not exist — see lib/clipboard.ts — so that path
 * is real here, not theoretical.
 *
 * Hidden until the row or card it sits in is hovered, so a directory does not
 * become a column of buttons: the parent needs `group`. Except on a touch
 * screen, where nothing is ever hovered and a hover-only button is a button
 * that does not exist — below `md` it is simply always there.
 */
export default function CopyValue({
  value,
  label,
  className = '',
  children,
}: {
  /** What lands on the clipboard — the bare value, not what is drawn. */
  value: string;
  /** What it is, for the tooltip: "Copy email address". */
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const valueRef = useRef<HTMLSpanElement>(null);

  async function copy() {
    if (await copyToClipboard(value)) {
      setState('copied');
      window.setTimeout(() => setState((was) => (was === 'copied' ? 'idle' : was)), 2000);
      return;
    }
    // Nothing was copied. Selecting the value at least leaves the reader one
    // keystroke away, which beats a button that reports success it did not
    // have — and the tooltip below says what to press.
    const node = valueRef.current;
    if (node) {
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    setState('manual');
  }

  const title = state === 'copied'
    ? 'Copied'
    : state === 'manual'
      ? 'This browser will not let the page copy — the text is selected, press Ctrl+C'
      : `Copy ${label}`;

  return (
    <span className={`inline-flex min-w-0 items-start gap-1 ${className}`}>
      {/* `contents` so this span holds the value for the fallback to select
          without becoming a box of its own. As a box it took its line height
          from whatever it inherited rather than from the small text inside it,
          which pushed every copyable line a few pixels taller than the plain
          ones — enough to knock a card's details out of step with the card
          beside it. */}
      <span ref={valueRef} className="contents">{children}</span>
      <button
        type="button"
        onClick={copy}
        title={title}
        aria-label={title}
        // A fixed 16px box, the line height of the text it sits beside, so a
        // line with a copy button on it is exactly as tall as one without.
        className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded transition hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-300 ${
          state === 'copied' ? 'text-green-600' : state === 'manual' ? 'text-amber-600' : 'text-gray-300'
        } ${state === 'idle' ? 'md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100' : ''}`}
      >
        {state === 'copied'
          ? <Check size={12} strokeWidth={2.5} />
          : <Copy size={12} strokeWidth={2} />}
      </button>
    </span>
  );
}
