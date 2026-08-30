'use client';

import { useEffect, useRef, useState } from 'react';
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
  const box = useRef<HTMLDivElement>(null);

  // Read in an effect: the server renders this too, and it has no Notification.
  useEffect(() => { setPermission(desktopPermission()); }, []);

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
        className={`rounded-lg p-1.5 transition hover:bg-gray-100 ${
          silent ? 'text-gray-300 hover:text-gray-600' : 'text-brand-500 hover:text-brand-700'
        }`}
      >
        {silent ? <BellOff size={16} /> : <Bell size={16} />}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
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
        </div>
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
