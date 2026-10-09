'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, BellOff } from 'lucide-react';
import { useChat } from '@/context/ChatContext';
import {
  desktopPermission,
  playChime,
  requestDesktopPermission,
  type PermissionState,
} from '@/lib/chatNotify';

/**
 * How this browser lets you know a message arrived.
 *
 * Deliberately a control the user opens, not a prompt on page load. Browsers
 * penalise sites that ask for notification permission unprompted — some hide
 * the request permanently — so nothing here happens until somebody clicks.
 */
export default function NotifyMenu() {
  const { notifyPrefs, setNotifyPrefs } = useChat();
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState<PermissionState>('unsupported');
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  // Read in an effect: the server renders this too, and it has no Notification.
  // Re-read on every open, because ChatContext asks on the first click anywhere
  // and the answer can arrive after this has mounted.
  useEffect(() => { setPermission(desktopPermission()); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !menu.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    // A fixed menu does not follow its button, so a scroll or resize closes it
    // rather than leaving it floating somewhere the bell no longer is.
    const away = (e: Event) => {
      if (!menu.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', away, true);
    window.addEventListener('resize', away);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', away, true);
      window.removeEventListener('resize', away);
    };
  }, [open]);

  // Under the bell, right edges lined up, then pushed back on screen.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const a = box.current?.getBoundingClientRect();
    const m = menu.current?.getBoundingClientRect();
    if (!a || !m) return;
    const left = Math.max(8, Math.min(a.right - m.width, window.innerWidth - m.width - 8));
    setPos({ top: a.bottom + 4, left });
  }, [open]);

  // Silent is anything that would not actually reach someone looking away:
  // desktop notifications switched off or never allowed, and no sound either.
  const silent = (!notifyPrefs.desktop || permission !== 'granted') && !notifyPrefs.sound;

  async function allowDesktop() {
    const result = await requestDesktopPermission();
    setPermission(result);
    if (result === 'granted') setNotifyPrefs({ ...notifyPrefs, desktop: true });
  }

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        title={silent ? 'Alerts are off' : 'Alerts'}
        className={`rounded-full p-2 transition hover:bg-gray-100 ${
          silent ? 'text-gray-400 hover:text-gray-700' : 'text-brand-500 hover:text-brand-700'
        }`}
      >
        {silent ? <BellOff size={20} /> : <Bell size={20} />}
      </button>

      {open && createPortal(
        /* Portalled to <body> at a fixed position. Drawn in place it sat inside
           the dashboard <main>, which is overflow-y-auto — and that clips
           horizontally too — so whatever reached past the conversation
           column's left edge was cut off under the sidebar. Narrowing it only
           held until the header gained another button and the bell moved left. */
        <div
          ref={menu}
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
          className="fixed z-[60] w-60 rounded-lg border border-gray-200 bg-white p-3 shadow-xl"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            When a message arrives
          </p>

          {permission === 'unsupported' && (
            <p className="mb-2 text-xs text-gray-500">
              This browser cannot show desktop notifications. The count in the tab
              title and the sound below still work.
            </p>
          )}

          {permission === 'default' && (
            <div className="mb-3 rounded-lg bg-brand-50 p-2.5">
              <p className="mb-2 text-xs text-brand-900">
                Your browser has not been asked yet. Allow it and TTMS can pop a
                notification when you are working in another window.
              </p>
              <button
                type="button"
                onClick={() => void allowDesktop()}
                className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-600"
              >
                Allow notifications
              </button>
            </div>
          )}

          {permission === 'denied' && (
            <p className="mb-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">
              Notifications are blocked for this site. Turn them back on in the
              padlock menu beside the web address, then reload.
            </p>
          )}

          <Toggle
            label="Desktop notification"
            hint={permission === 'granted' ? undefined : 'Needs permission above'}
            checked={notifyPrefs.desktop && permission === 'granted'}
            disabled={permission !== 'granted'}
            onChange={(on) => setNotifyPrefs({ ...notifyPrefs, desktop: on })}
          />
          <Toggle
            label="Play a sound"
            hint="Off by default — a shared desk would not thank you"
            checked={notifyPrefs.sound}
            onChange={(on) => {
              setNotifyPrefs({ ...notifyPrefs, sound: on });
              // Play it as they switch it on, so nobody has to wait for a real
              // message to find out how loud it is.
              if (on) playChime();
            }}
          />

          <p className="mt-3 border-t border-gray-100 pt-2.5 text-[11px] leading-relaxed text-gray-400">
            All of this needs TTMS open in a tab. Nothing can reach you once you
            have closed it — that needs TTMS to be properly deployed first.
          </p>
        </div>,
        document.body,
      )}
    </div>
  );
}

function Toggle({
  label, hint, checked, disabled, onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label
      className={`flex items-start gap-2.5 rounded-lg px-1 py-2 ${
        disabled ? 'opacity-50' : 'cursor-pointer hover:bg-gray-50'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-gray-300 text-brand-500 focus:ring-brand-400"
      />
      <span className="min-w-0">
        <span className="block text-sm text-gray-800">{label}</span>
        {hint && <span className="block text-[11px] text-gray-400">{hint}</span>}
      </span>
    </label>
  );
}
