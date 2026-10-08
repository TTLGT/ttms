'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * A dollar amount box that shows its thousands separators as you type —
 * "1,000,000", not "1000000", where a missing zero is easy to miss.
 *
 * The commas are display only. `value` and `onChange` carry the bare figure
 * ("1000000", "1250.5"), so every caller keeps parsing exactly what it parsed
 * before. That is also why this is a text box and not `type="number"`: a number
 * input cannot hold a comma at all.
 *
 * A draft is kept here rather than drawn straight from `value`, because several
 * callers hold the amount as a number and would turn a half-typed "12." back
 * into "12" under the cursor. The draft only gives way when the parent's figure
 * actually differs from it — a record loading in, or a form being reset.
 */
export default function MoneyInput({
  value,
  onChange,
  cents = true,
  className,
  ...rest
}: {
  value: string;
  onChange: (raw: string) => void;
  /** false for whole dollars — insurance coverage is never quoted in cents. */
  cents?: boolean;
  className: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'className'>) {
  const [draft, setDraft] = useState(() => cleanMoney(value, cents));
  const ref = useRef<HTMLInputElement>(null);
  // How many digits (and the point) sat left of the cursor when the user typed.
  // Re-inserting commas moves everything, so the caret is put back by counting
  // those rather than by character position.
  const caret = useRef<number | null>(null);

  useEffect(() => {
    if (sameAmount(value, draft)) return;
    setDraft(cleanMoney(value, cents));
    // Only the parent's figure is watched; the draft changing is the user typing.
  }, [value, cents]);

  const shown = withCommas(draft);

  useLayoutEffect(() => {
    const el = ref.current;
    const want = caret.current;
    if (!el || want === null) return;
    caret.current = null;
    let pos = 0;
    for (let seen = 0; pos < shown.length && seen < want; pos++) {
      if (shown[pos] !== ',') seen++;
    }
    el.setSelectionRange(pos, pos);
  }, [shown]);

  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode={cents ? 'decimal' : 'numeric'}
      value={shown}
      onChange={(e) => {
        const typed = e.target.value;
        const at = e.target.selectionStart ?? typed.length;
        const next = cleanMoney(typed, cents);
        caret.current = Math.min(cleanMoney(typed.slice(0, at), cents, false).length, next.length);
        setDraft(next);
        onChange(next);
      }}
      className={className}
    />
  );
}

/**
 * Digits and at most one point, with no more than two places after it. Without
 * cents, anything after a point is dropped rather than run into the figure, so
 * a pasted "$1,000,000.00" stays a million and does not become a hundred.
 * `trimZeros` is off when measuring a prefix for the caret, which must not be
 * shortened by a leading zero the full value keeps.
 */
function cleanMoney(raw: string, cents: boolean, trimZeros = true): string {
  const s = (raw ?? '').replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  let whole = dot === -1 ? s : s.slice(0, dot);
  if (trimZeros) whole = whole.replace(/^0+(?=\d)/, '');
  if (dot === -1) return whole;
  if (!cents) return whole;
  return `${whole}.${s.slice(dot + 1).replace(/\./g, '').slice(0, 2)}`;
}

function withCommas(raw: string): string {
  const dot = raw.indexOf('.');
  const whole = dot === -1 ? raw : raw.slice(0, dot);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dot === -1 ? grouped : `${grouped}${raw.slice(dot)}`;
}

/** "12." and "12", or "" and "", are the same amount; the draft wins those. */
function sameAmount(a: string, b: string): boolean {
  const x = parseFloat((a ?? '').replace(/,/g, ''));
  const y = parseFloat((b ?? '').replace(/,/g, ''));
  if (Number.isNaN(x) || Number.isNaN(y)) return Number.isNaN(x) && Number.isNaN(y);
  return x === y;
}
