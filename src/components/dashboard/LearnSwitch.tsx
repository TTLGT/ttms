'use client';

import Link from 'next/link';
import { Languages } from 'lucide-react';
import { useLearn } from '@/context/LearnContext';

/*
 * Learn English, on or off. At the foot of the sidebar beside the theme
 * switch, because like the theme it is a setting about this screen — see
 * LearnContext.
 *
 * "My words" is here rather than in the nav list: it matters only to somebody
 * using the mode, and a nav entry everybody sees for a feature most people
 * never turn on would be noise. The meaning card links to it too.
 *
 * Drawn for the sidebar, which is brand-900 in both themes.
 */
export default function LearnSwitch({ current }: { current: boolean }) {
  const { enabled, setEnabled } = useLearn();

  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => setEnabled(!enabled)}
        title={enabled
          ? 'Turn off the dotted underlines'
          : 'Underline English words and show what they mean in Spanish'}
        className="flex items-center gap-2 text-xs text-blue-300 transition hover:text-white"
      >
        <Languages size={14} />
        Learn English
        <span
          aria-hidden
          className={`relative h-4 w-7 rounded-full transition ${enabled ? 'bg-brand-400' : 'bg-brand-700'}`}
        >
          {/* A literal white: `bg-white` means "the page colour", which dark
              mode turns near-black, and the sidebar does not change. */}
          <span
            className={`absolute top-0.5 h-3 w-3 rounded-full bg-[#ffffff] transition-all ${enabled ? 'left-3.5' : 'left-0.5'}`}
          />
        </span>
      </button>
      {enabled && (
        <Link
          href="/dashboard/words"
          aria-current={current ? 'page' : undefined}
          className={`text-xs transition hover:text-white ${current ? 'text-white' : 'text-blue-300'}`}
        >
          My words →
        </Link>
      )}
    </div>
  );
}
