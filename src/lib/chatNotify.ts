'use client';

/**
 * Getting someone's attention when TTMS is open but not in front of them.
 *
 * This is the whole answer to "I missed your message" for now, and it is worth
 * being clear about its one hard limit: **everything here needs TTMS to be
 * open in a tab.** A browser cannot notify for an app that is not running, and
 * TTMS has no deployment, so there is no server able to reach a closed laptop.
 * Notifying people who have gone home means push notifications or email, and
 * both wait on a deployment.
 *
 * Within that limit it covers the common case — TTMS running all day behind a
 * spreadsheet — three ways at once, because different people notice different
 * things: a desktop notification, a count in the browser tab, and a sound.
 */

export interface NotifyPrefs {
  /** A desktop notification for each new message. Needs browser permission. */
  desktop: boolean;
  /** A short chime. Off by default — a shared office would hate the opposite. */
  sound: boolean;
}

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = { desktop: true, sound: false };

const PREFS_KEY = 'ttms.chatNotify';

/**
 * Preferences live in this browser, not on the user's record.
 *
 * They are about this machine — whether it has speakers, whether it is the
 * shared terminal in dispatch — and not about the person. Someone who turns
 * the sound off at the front desk should not have it off at home.
 */
export function loadNotifyPrefs(): NotifyPrefs {
  if (typeof window === 'undefined') return DEFAULT_NOTIFY_PREFS;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_NOTIFY_PREFS;
    const saved = JSON.parse(raw) as Partial<NotifyPrefs>;
    return {
      desktop: saved.desktop ?? DEFAULT_NOTIFY_PREFS.desktop,
      sound:   saved.sound   ?? DEFAULT_NOTIFY_PREFS.sound,
    };
  } catch {
    // Private browsing, storage off, or something else wrote nonsense here.
    return DEFAULT_NOTIFY_PREFS;
  }
}

export function saveNotifyPrefs(prefs: NotifyPrefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // The preference still applies for this session; nothing else to do.
  }
}

export type PermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

export function desktopPermission(): PermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as PermissionState;
}

/**
 * Asks the browser for permission to show notifications.
 *
 * Must be called from a real click. Browsers refuse — and some permanently
 * hold it against the site — when the prompt appears unprompted on page load,
 * which is why nothing here runs on mount and there is a button instead.
 */
export async function requestDesktopPermission(): Promise<PermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  try {
    return (await Notification.requestPermission()) as PermissionState;
  } catch {
    return Notification.permission as PermissionState;
  }
}

/**
 * Shows one notification.
 *
 * `tag` is the conversation id, so a room that gets five messages while you
 * are away replaces its own notification four times instead of stacking five
 * of them down the corner of the screen.
 */
export function showMessageNotification(options: {
  title: string;
  body: string;
  tag: string;
  onClick: () => void;
}): void {
  if (desktopPermission() !== 'granted') return;
  try {
    const n = new Notification(options.title, {
      body: options.body,
      tag:  options.tag,
      icon: '/logo-circle.png',
    });
    n.onclick = () => {
      window.focus();
      options.onClick();
      n.close();
    };
  } catch {
    // Some browsers throw when constructed outside a service worker. Losing a
    // notification is not worth breaking the message that triggered it.
  }
}

/**
 * A short two-note chime, synthesised rather than loaded from a file.
 *
 * A bundled sound file would be another asset to serve, and every stock one
 * either sounds like somebody else's app or is long enough to be irritating on
 * the twentieth message of the morning. Two quick sine tones are neither.
 */
export function playChime(): void {
  try {
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const now = ctx.currentTime;

    for (const [index, freq] of [880, 1174.7].entries()) {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const at = now + index * 0.09;
      // Faded in and out rather than switched on: a square-edged start and
      // stop on a sine tone is audible as a click.
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.09, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.18);
    }
    // Released once the sound is done — browsers cap how many audio contexts a
    // page may hold open, and this runs on every message.
    window.setTimeout(() => void ctx.close().catch(() => {}), 600);
  } catch {
    // Audio blocked until the page has been interacted with. Not worth surfacing.
  }
}

/**
 * Puts the unread count in front of the browser tab title.
 *
 * The base title is captured the first time this runs rather than hard-coded,
 * so it keeps whatever the page set and survives a rename of the app.
 */
let baseTitle: string | null = null;

export function setUnreadTitle(count: number): void {
  if (typeof document === 'undefined') return;
  if (baseTitle === null) baseTitle = document.title.replace(/^\(\d+\)\s*/, '');
  document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;
}
