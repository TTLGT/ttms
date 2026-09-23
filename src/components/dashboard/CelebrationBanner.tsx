'use client';

import { useEffect, useState } from 'react';
import { Award, Cake, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fetchMyRecord, type MyRecord } from '@/lib/profileRequests';
import { COMPANY_NAME, completedYears, matchingMonthDays, type CelebrationKind } from '@/types/celebration';

/**
 * A note at the top of your own dashboard on your birthday or your work
 * anniversary.
 *
 * **Only the person it is about ever sees it.** The dates come from `/api/me`,
 * which returns the caller's own allowlist entry and nobody else's — so this
 * loosens nothing about who can see a birthday or a start date, unlike the
 * Everyone-room post in src/lib/celebrations.ts. That is also why it ignores
 * `announceBirthday` / `announceAnniversary`: those switches are "do not tell
 * the company", and nothing here tells anybody.
 *
 * "Today" is the browser's own day rather than the office's. The room post has
 * to pick one timezone for everybody; this has one reader, and their day
 * starts at their midnight.
 *
 * Closing one is remembered in this browser for the rest of the day, per kind
 * and keyed by the date, so next year's is not already dismissed and closing
 * the birthday does not also close an anniversary that falls on the same day.
 */

const DISMISS_KEY: Record<CelebrationKind, string> = {
  birthday:    'ttms.birthdayBanner.dismissed',
  anniversary: 'ttms.anniversaryBanner.dismissed',
};

interface Greeting {
  kind: CelebrationKind;
  icon: LucideIcon;
  title: string;
  body: string;
}

/** The browser's own date as `YYYY-MM-DD` — `en-CA` formats as ISO. */
function localToday(): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function isDismissed(kind: CelebrationKind, today: string): boolean {
  try { return localStorage.getItem(DISMISS_KEY[kind]) === today; } catch { return false; }
}

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

type Dates = Pick<MyRecord, 'firstName' | 'displayName' | 'dateOfBirth' | 'startDate'>;

function greetingsFor(me: Dates, today: string): Greeting[] {
  // matchingMonthDays() is the room post's own rule, so somebody born or
  // hired on the 29th of February gets theirs on the 28th in other years —
  // the same day the room congratulates them.
  const days = matchingMonthDays(today);
  const first = me.firstName.trim() || me.displayName.trim().split(' ')[0] || '';
  const to = first ? `, ${first}` : '';
  const found: Greeting[] = [];

  if (isDate(me.dateOfBirth) && days.includes(me.dateOfBirth.slice(5)) && !isDismissed('birthday', today)) {
    found.push({
      kind: 'birthday',
      icon: Cake,
      title: `Happy birthday${to}!`,
      body: 'Thank you for everything you do for the team. We hope you have a great day.',
    });
  }

  if (isDate(me.startDate) && days.includes(me.startDate.slice(5)) && !isDismissed('anniversary', today)) {
    // Nought years is a first day, not an anniversary — same rule as the post.
    const years = completedYears(me.startDate, today);
    if (years >= 1) {
      const span = `${years} ${years === 1 ? 'year' : 'years'}`;
      found.push({
        kind: 'anniversary',
        icon: Award,
        title: `Happy ${span} with us${to}!`,
        body: `Thank you for ${span} of hard work. We're glad to have you on the team.`,
      });
    }
  }

  return found;
}

/**
 * `record` is for a page that has already loaded the caller's own record — the
 * profile page — so the banner costs it no second read. Without it, the banner
 * fetches `/api/me` itself, as it does on the dashboard.
 */
export default function CelebrationBanner({ record }: { record?: Dates } = {}) {
  const [greetings, setGreetings] = useState<Greeting[]>([]);
  const [today] = useState(localToday);

  useEffect(() => {
    // Checked before fetching, so a day with both already closed costs no read.
    if (isDismissed('birthday', today) && isDismissed('anniversary', today)) return;

    if (record) {
      setGreetings(greetingsFor(record, today));
      return;
    }

    let cancelled = false;
    fetchMyRecord()
      .then((me) => { if (!cancelled) setGreetings(greetingsFor(me, today)); })
      // No banner is the right failure: it is a greeting, not information.
      .catch(() => {});
    return () => { cancelled = true; };
  }, [today, record]);

  if (greetings.length === 0) return null;

  const dismiss = (kind: CelebrationKind) => {
    try { localStorage.setItem(DISMISS_KEY[kind], today); } catch { /* private window */ }
    setGreetings((g) => g.filter((x) => x.kind !== kind));
  };

  return (
    <div className="mb-6 space-y-3">
      {greetings.map(({ kind, icon: Icon, title, body }) => (
        <div
          key={kind}
          role="status"
          className="relative flex items-start gap-4 overflow-hidden rounded-xl bg-gradient-to-br from-brand-900 via-brand-700 to-brand-600 py-5 pl-5 pr-14 text-white shadow-sm"
        >
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 text-amber-200">
            <Icon size={24} />
          </div>
          <div className="min-w-0">
            <p className="font-[family-name:var(--font-rajdhani)] text-2xl font-bold leading-tight">{title}</p>
            <p className="mt-1 max-w-prose text-sm text-blue-100">{body}</p>
            {/* Signed at the foot rather than titled at the head — the company is
                the one saying it, the same as the post in the Everyone room. */}
            <p className="mt-2.5 text-[13px] italic text-blue-200">— {COMPANY_NAME}</p>
          </div>
          <button
            type="button"
            onClick={() => dismiss(kind)}
            aria-label={kind === 'birthday' ? 'Close the birthday banner' : 'Close the anniversary banner'}
            className="absolute right-3 top-3 rounded-lg p-1.5 text-blue-200 transition hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
