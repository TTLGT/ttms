'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Image as ImageIcon } from 'lucide-react';
import { CHAT_WALLPAPERS, useChatWallpaper } from '@/lib/chatWallpaper';

/**
 * Pick the background chat messages sit on. Beside the alerts bell because it
 * is the same kind of thing — a setting about this browser, not about the
 * person — and so has no place on the profile page.
 *
 * Each swatch is the real ground in miniature, drawn by the same classes as
 * the conversation, so what is picked is exactly what appears, in whichever
 * theme is on.
 */
export default function WallpaperMenu() {
  const { wallpaper, setWallpaper } = useChatWallpaper();
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
        title="Chat background"
        aria-label="Chat background"
        className="rounded-full p-2 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
      >
        <ImageIcon size={20} />
      </button>

      {open && (
        /* w-60 for the same reason as NotifyMenu's: the conversation column is
           288px and <main> clips anything that spills past its left edge. */
        <div className="absolute right-0 top-full z-30 mt-1 w-60 rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
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

          <p className="mt-3 border-t border-gray-100 pt-2.5 text-[11px] leading-relaxed text-gray-400">
            Only changes this browser. Nobody else sees what you pick.
          </p>
        </div>
      )}
    </div>
  );
}
