'use client';

import { useState } from 'react';
import { Link2, Check } from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';

/**
 * Copies the address of the page you are on, so a record can be handed to a
 * colleague without selecting the URL bar.
 *
 * The copying itself lives in lib/clipboard.ts, which carries the fallbacks
 * this app needs on a plain-http office network. When even those fail, the URL
 * is shown here in a selected box for the reader to copy by hand — a button
 * that silently did nothing on half the desks would be worse than no button.
 */
export default function CopyLinkButton({ label = 'Copy link' }: { label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [url,   setUrl]   = useState('');

  async function copy() {
    const href = window.location.href;
    setUrl(href);
    if (await copyToClipboard(href)) { done(); return; }
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
