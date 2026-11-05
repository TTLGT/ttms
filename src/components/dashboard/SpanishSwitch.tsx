'use client';

import { useSpanish } from '@/context/SpanishContext';

/*
 * Spanish, on or off. At the foot of the sidebar beside Learn English and the
 * theme, because like them it is a setting about this screen — see
 * SpanishContext. English stays on screen either way; this only adds the
 * Spanish.
 *
 * Drawn for the sidebar, which is brand-900 in both themes.
 */
export default function SpanishSwitch() {
  const { on, setOn } = useSpanish();

  return (
    <div className="mb-2">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => setOn(!on)}
        title={on
          ? 'Stop showing the Spanish'
          : 'Show Spanish under the English, and in a bubble on buttons and labels'}
        className="flex items-center gap-2 text-xs text-blue-300 transition hover:text-white"
      >
        {/* Not an icon from the set: a flag would be a country, and the
            Learn English switch already has the languages icon. */}
        <span aria-hidden className="w-[14px] text-center text-[10px] font-bold leading-none">ES</span>
        Spanish
        <span
          aria-hidden
          className={`relative h-4 w-7 rounded-full transition ${on ? 'bg-brand-400' : 'bg-brand-700'}`}
        >
          {/* A literal white, for the reason given in LearnSwitch. */}
          <span
            className={`absolute top-0.5 h-3 w-3 rounded-full bg-[#ffffff] transition-all ${on ? 'left-3.5' : 'left-0.5'}`}
          />
        </span>
      </button>
    </div>
  );
}
