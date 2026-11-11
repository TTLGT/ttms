'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Image as ImageIcon } from 'lucide-react';
import { CHAT_WALLPAPERS, useChatWallpaper } from '@/lib/chatWallpaper';
import { CHAT_ALERT_STYLE_OPTIONS, useChatAlertStyle, type ChatAlertStyle } from '@/lib/chatAlertStyle';
import { Bi } from '@/components/spanish/Es';

/**
 * Pick how chat looks: the background messages sit on, and how load updates
 * are drawn (Tickets, Cards or Timeline — see SystemMessage.tsx). Beside the alerts bell because it
 * is the same kind of thing — a setting about this browser, not about the
 * person — and so has no place on the profile page.
 *
 * Each swatch is the real ground in miniature, drawn by the same classes as
 * the conversation, so what is picked is exactly what appears, in whichever
 * theme is on.
 */
export default function WallpaperMenu() {
  const { wallpaper, setWallpaper } = useChatWallpaper();
  const { style, setStyle } = useChatAlertStyle();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        title="Chat appearance"
        aria-label="Chat appearance"
        className="rounded-full p-2 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
      >
        <ImageIcon size={20} />
      </button>

      {open && (
        /* w-60 for the same reason as NotifyMenu's: the conversation column is
           288px and <main> clips anything that spills past its left edge.
           Centred under the button rather than pinned to its right edge:
           opening leftward from this button ran under the sidebar. Centred,
           it clears the column's left edge on desktop and the screen's edges
           on a phone, where the list is the full width. */
        <div className="absolute left-1/2 top-full z-30 mt-1 w-60 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
          <p data-es className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Chat background
          </p>

          <div role="radiogroup" aria-label="Chat background" className="grid grid-cols-3 gap-2">
            {CHAT_WALLPAPERS.map(({ id, label }) => {
              const active = wallpaper === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setWallpaper(id)}
                  className="group flex flex-col items-center gap-1 focus:outline-none"
                >
                  <span
                    data-wallpaper={id}
                    className={`chat-ground relative block h-14 w-full overflow-hidden rounded-lg border-2 transition ${
                      active
                        ? 'border-brand-500'
                        : 'border-gray-200 group-hover:border-gray-400 group-focus-visible:border-brand-300'
                    }`}
                  >
                    <span aria-hidden className="chat-wallpaper absolute inset-0" />
                    {active && (
                      <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-white">
                        <Check size={11} strokeWidth={3} />
                      </span>
                    )}
                  </span>
                  <span className={`text-[11px] ${active ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          <p data-es className="mb-2 mt-3 border-t border-gray-100 pt-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Load updates
          </p>
          <div role="radiogroup" aria-label="Load updates" className="grid grid-cols-3 gap-2">
            {CHAT_ALERT_STYLE_OPTIONS.map(({ id, label }) => {
              const active = style === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setStyle(id)}
                  className="group flex flex-col items-center gap-1 focus:outline-none"
                >
                  <span
                    className={`relative block h-14 w-full overflow-hidden rounded-lg border-2 bg-gray-50 p-1.5 transition ${
                      active
                        ? 'border-brand-500'
                        : 'border-gray-200 group-hover:border-gray-400 group-focus-visible:border-brand-300'
                    }`}
                  >
                    <StylePreview style={id} />
                    {active && (
                      <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-white">
                        <Check size={11} strokeWidth={3} />
                      </span>
                    )}
                  </span>
                  <span className={`text-[11px] ${active ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-3 border-t border-gray-100 pt-2.5 text-[11px] leading-relaxed text-gray-400">
            <Bi>Saved to your account. Nobody else sees what you pick.</Bi>
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Each style in miniature, so the choice is made by eye: a ticket's coloured
 * band, a card's tinted box with its icon tile, the timeline's line of dots.
 */
function StylePreview({ style }: { style: ChatAlertStyle }) {
  if (style === 'tickets') {
    return (
      <span className="flex h-full flex-col overflow-hidden rounded bg-white shadow-sm ring-1 ring-gray-200">
        <span className="h-2 bg-amber-600" />
        <span className="flex flex-1 flex-col justify-center gap-1 px-1.5">
          <span className="h-1 w-4/5 rounded-full bg-gray-400" />
          <span className="h-1 w-1/2 rounded-full bg-gray-200" />
        </span>
      </span>
    );
  }
  if (style === 'cards') {
    return (
      <span className="flex h-full items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-1.5">
        <span className="h-4 w-4 flex-shrink-0 rounded bg-white ring-1 ring-emerald-300" />
        <span className="flex flex-1 flex-col gap-1">
          <span className="h-1 w-full rounded-full bg-gray-400" />
          <span className="h-1 w-2/3 rounded-full bg-gray-200" />
        </span>
      </span>
    );
  }
  return (
    <span className="relative flex h-full flex-col justify-around pl-4">
      <span className="absolute bottom-1 left-[5px] top-1 w-px bg-gray-300" />
      {['bg-blue-500', 'bg-emerald-500', 'bg-amber-500'].map((dot) => (
        <span key={dot} className="relative flex items-center">
          <span className={`absolute -left-[14px] h-2 w-2 rounded-full ${dot}`} />
          <span className="h-1 w-4/5 rounded-full bg-gray-400" />
        </span>
      ))}
    </span>
  );
}
