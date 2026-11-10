import type { CSSProperties } from 'react';

/*
 * A small clock whose hour hand turns from one hour to the next once, when it
 * first appears — back for "fall back", forward for "spring forward" — with
 * the hour that is skipped or lived twice marked as an amber arc. Still for
 * anybody who has asked for reduced motion; the styles are `.tz-clock` in
 * globals.css.
 */
export default function ClockFace({ from, to, size = 64 }: { from: number; to: number; size?: number }) {
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6;
    const q = i % 3 === 0;
    const r1 = q ? 21 : 23.5;
    return (
      <line
        key={i}
        className={q ? 'tick q' : 'tick'}
        x1={(32 + r1 * Math.sin(a)).toFixed(2)} y1={(32 - r1 * Math.cos(a)).toFixed(2)}
        x2={(32 + 26 * Math.sin(a)).toFixed(2)} y2={(32 - 26 * Math.cos(a)).toFixed(2)}
      />
    );
  });
  const r = 16;
  const at = (h: number) => {
    const a = (h * Math.PI) / 6;
    return `${(32 + r * Math.sin(a)).toFixed(2)} ${(32 - r * Math.cos(a)).toFixed(2)}`;
  };
  const style = {
    '--from': `${from * 30}deg`,
    '--to': `${to * 30}deg`,
    '--spin-dir': to > from ? 'normal' : 'reverse',
    width: size,
    height: size,
  } as CSSProperties;

  return (
    <svg className="tz-clock play block" viewBox="0 0 64 64" style={style} role="img" aria-label={`Clock turning from ${from}:00 to ${to}:00`}>
      <circle className="face" cx="32" cy="32" r="29" />
      {ticks}
      <path className="arc" d={`M ${at(from)} A ${r} ${r} 0 0 ${to > from ? 1 : 0} ${at(to)}`} />
      <line className="hand hour" x1="32" y1="32" x2="32" y2="18" />
      <line className="hand min" x1="32" y1="32" x2="32" y2="10" />
      <circle className="hub" cx="32" cy="32" r="2.6" />
    </svg>
  );
}
