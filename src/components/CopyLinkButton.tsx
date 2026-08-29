'use client';

import { useState } from 'react';
import { Link2, Check } from 'lucide-react';

/**
 * Copies the address of the page you are on, so a record can be handed to a
 * colleague without selecting the URL bar.
 *
 * The clipboard API is only available in a secure context — https, or
 * localhost. Staff reach this app over plain http on the office network, where
 * `navigator.clipboard` is simply undefined, so there are two fallbacks: the
 * old execCommand path, and failing that the URL itself in a selected box for
 * the reader to copy by hand. A button that silently did nothing on half the
 * desks would be worse than no button.
 */
export default function CopyLinkButton({ label = 'Copy link' }: { label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [url,   setUrl]   = useState('');

  async function copy() {
    const href = window.location.href;
    setUrl(href);

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(href);
        done();
        return;
      } catch {
        // Permission refused or a non-secure context that still exposed the
        // object. Fall through rather than reporting success.
      }
    }

    if (legacyCopy(href)) { done(); return; }
    setState('manual');
  }

  function done() {
    setState('copied');
    window.setTimeout(() => setState('idle'), 2000);
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={copy}
        title="Copy a link to this page"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
      >
        {state === 'copied'
          ? <><Check className="w-4 h-4 text-green-600" /> Copied</>
          : <><Link2 className="w-4 h-4" /> {label}</>}
      </button>

      {state === 'manual' && (
        // autoFocus rather than a ref callback: an inline ref re-runs on every
        // render and would keep re-selecting the box under the reader.
        <input
          readOnly
          autoFocus
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="w-72 rounded border border-gray-300 px-2 py-1 text-xs font-mono text-gray-700"
        />
      )}
    </div>
  );
}

/** Pre-clipboard-API copy. Returns whether it actually worked. */
function legacyCopy(text: string): boolean {
  try {
    const el = document.createElement('textarea');
    el.value = text;
    // Kept on screen but out of view: a display:none element cannot be selected,
    // which is the usual reason this trick fails.
    el.style.position = 'fixed';
    el.style.top = '-1000px';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
