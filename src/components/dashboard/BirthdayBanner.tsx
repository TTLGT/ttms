'use client';

import { useEffect, useState } from 'react';
import { Cake, X } from 'lucide-react';
import { fetchMyRecord } from '@/lib/profileRequests';
import { COMPANY_NAME, matchingMonthDays } from '@/types/celebration';

/**
 * A happy-birthday note at the top of your own dashboard, on your birthday.
 *
 * **Only the person it is about ever sees it.** The date comes from `/api/me`,
 * which returns the caller's own allowlist entry and nobody else's — so this
 * loosens nothing about who can see a birthday, unlike the Everyone-room post
 * in src/lib/celebrations.ts. That is also why it ignores `announceBirthday`:
 * that switch is "do not tell the company", and nothing here tells anybody.
 *
 * "Today" is the browser's own day rather than the office's. The room post has
 * to pick one timezone for everybody; this has one reader, and their birthday
 * starts at their midnight.
 *
 * Closing it is remembered in this browser for the rest of the day, keyed by
 * the date, so next year's banner is not already dismissed.
 */

const DISMISS_KEY = 'ttms.birthdayBanner.dismissed';

/** The browser's own date as `YYYY-MM-DD` — `en-CA` formats as ISO. */
function localToday(): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export default function BirthdayBanner() {
  const [name, setName] = useState<string | null>(null);
  const [today] = useState(localToday);

  useEffect(() => {
    // Checked before fetching, so a banner already closed today costs no read.
    try { if (localStorage.getItem(DISMISS_KEY) === today) return; } catch { /* private window */ }

    let cancelled = false;
    fetchMyRecord()
      .then((me) => {
        const dob = me.dateOfBirth;
        // matchingMonthDays() is the room post's own rule, so somebody born on
        // the 29th of February gets their banner on the 28th in other years —
        // the same day the room congratulates them.
        if (cancelled || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return;
        if (!matchingMonthDays(today).includes(dob.slice(5))) return;
        const first = me.firstName.trim() || me.displayName.trim().split(' ')[0] || '';
        setName(first);
      })
      // No banner is the right failure: it is a greeting, not information.
      .catch(() => {});
    return () => { cancelled = true; };
  }, [today]);

  if (name === null) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, today); } catch { /* private window */ }
    setName(null);
  };

  return (
    <div
      role="status"
      className="relative mb-6 flex items-start gap-4 overflow-hidden rounded-xl bg-gradient-to-br from-brand-900 via-brand-700 to-brand-600 py-5 pl-5 pr-14 text-white shadow-sm"
    >
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 text-amber-200">
        <Cake size={24} />
      </div>
      <div className="min-w-0">
        <p className="font-[family-name:var(--font-rajdhani)] text-2xl font-bold leading-tight">
          Happy birthday{name ? `, ${name}` : ''}!
        </p>
        <p className="mt-1 max-w-prose text-sm text-blue-100">
          Thank you for everything you do for the team. We hope you have a great day.
        </p>
        {/* Signed at the foot rather than titled at the head — the company is
            the one saying it, the same as the post in the Everyone room. */}
        <p className="mt-2.5 text-[13px] italic text-blue-200">— {COMPANY_NAME}</p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Close the birthday banner"
        className="absolute right-3 top-3 rounded-lg p-1.5 text-blue-200 transition hover:bg-white/10 hover:text-white"
      >
        <X size={16} />
      </button>
    </div>
  );
}
