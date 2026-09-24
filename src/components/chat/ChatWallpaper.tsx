import type { ReactNode } from 'react';

/**
 * The patterned ground a conversation is read on — freight drawings over a
 * paper tone, in the manner of WhatsApp. The look itself is in globals.css.
 *
 * The pattern sits on a layer of its own behind the scroller rather than on
 * the scroller, which is the whole reason this component exists. Painted on
 * the scrolling element it would have to be a background image, which cannot
 * be recoloured for dark mode; drawn as a mask, it needs an element of its own
 * that does not scroll, or the pattern would end where the first screenful of
 * messages did. So: a still layer, and the scroller over it, transparent.
 *
 * `children` must be the scroller, filling this box (`h-full`) and positioned
 * (`relative`) so it stacks above the pattern.
 */
export default function ChatWallpaper({ children }: { children: ReactNode }) {
  return (
    <div className="chat-ground relative min-h-0 flex-1">
      <div aria-hidden className="chat-wallpaper pointer-events-none absolute inset-0" />
      {children}
    </div>
  );
}
