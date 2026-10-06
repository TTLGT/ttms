import type { CSSProperties } from 'react';
import type { GameTheme } from '@/types/taskGame';
import { LEVEL_ART } from './taskLevelArt';

/**
 * The hand-drawn picture for a level in a game theme, drawn in `color`.
 * Past the last level it keeps the last picture, the same rule
 * `levelTitle()` follows.
 *
 * The markup is our own constant from `taskLevelArt.ts`, never anything a user
 * typed, which is why setting it as HTML is safe.
 */
export function LevelArt({
  level,
  theme,
  size,
  color,
  className,
}: {
  level: number;
  theme: GameTheme;
  size: number;
  color: string;
  className?: string;
}) {
  const art = LEVEL_ART[theme];
  const body = art[level - 1] ?? art[art.length - 1];
  const style: CSSProperties = { color };
  return (
    <svg
      aria-hidden
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}
