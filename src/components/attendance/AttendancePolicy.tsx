'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';

/**
 * What TTMS records about attendance, in plain words — shown to everybody on
 * their own profile and to HR on the Attendance page (idea 20).
 *
 * It exists because a record people do not know is being kept is a record
 * nobody trusts, including the people it is about. If you add something that
 * is recorded, add it here; if something here stops being true, change it the
 * same day.
 */
export default function AttendancePolicy({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <ShieldCheck size={16} className="flex-shrink-0 text-brand-600" />
        <span className="flex-1 text-sm font-semibold text-gray-900">What TTMS records about your attendance</span>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>
      {open && (
        <div className="space-y-3 border-t border-gray-100 px-4 py-3 text-sm leading-relaxed text-gray-600">
          <div>
            <p className="font-semibold text-gray-800">Recorded</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>When you press <strong>Clock in</strong>, <strong>Clock out</strong>, <strong>Break</strong> and <strong>Lunch</strong>. These are your hours.</li>
              <li>At each clock in and out: the internet address you connected from, the city and internet provider that address belongs to, whether it is the office network, and your browser and type of device (for example “Windows · Chrome · desktop”).</li>
              <li>Every five minutes while TTMS is open: whether you used it (clicked, typed or scrolled) in that time. This shows as active or idle minutes. Idle time is never taken off your hours — a phone call looks idle to a browser.</li>
              <li>
                <strong>While you are clocked in</strong>, on Chrome and Edge: whether the computer as a whole is in use —
                any keyboard or mouse use, and whether the screen is locked — so working in another program counts as
                active. Only yes or no, once a minute. Never which program, what you typed, or what is on your screen.
                Outside your clocked-in hours, only your use of TTMS itself is counted.
              </li>
              <li>How many loads you created or edited, status changes, agreements sent, documents uploaded and chat messages sent — counts only, never what they said.</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-gray-800">Not recorded</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>Your exact location. The city comes from the internet address and is often just the provider’s city.</li>
              <li>Screenshots, keystrokes, the programs or websites you use, or what you do in them.</li>
              <li>Anything about your computer when you are clocked out, other than your use of TTMS.</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-gray-800">Who sees it</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>You see all of your own, on this page.</li>
              <li>HR and administrators see everybody’s. A Sales Manager sees their own team’s.</li>
              <li>Colleagues see only what chat shows: Online, Away, Last seen, and any status you set. You can hide your last seen below; HR still sees your attendance.</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-gray-800">If something is wrong</p>
            <p className="mt-1">
              Ask for a correction on the day. HR decides it, and the original time is always kept beside the change.
              If you forget to clock out, TTMS closes your day at the last time you used it and marks it so you can ask.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
