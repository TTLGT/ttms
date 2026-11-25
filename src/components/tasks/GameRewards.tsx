'use client';

import { useEffect, useRef } from 'react';
import { Flame, Shield } from 'lucide-react';
import { LevelArt } from './LevelArt';
import type { TaskSkin } from './taskSkins';
import { MAX_SHIELDS, dayOf, levelFor, levelProgress, levelTitle, nextLevelAfter, type GameState } from '@/types/taskGame';

/**
 * Game mode's rewards on the Planner's Today tab (step 7 of the redesign):
 *
 *  - `GameStrip` — the level, the XP to the next one, the streak and what
 *    today has earned so far, in one dark line above the day. The banner on
 *    the Tasks tab is the full version; this is the glance.
 *  - `DoneStamp` — "Done" stamped across a finished pick.
 *  - `Confetti` — once, when the last of Today's 3 is ticked.
 *
 * All of it is drawing. XP is never worked out here: the numbers are the
 * ones the server sent back with the save (src/types/taskGame.ts).
 *
 * Fixed colours on the strip, like the banner: it is a dark panel in every
 * app theme, so nothing in it uses the theme-mapped Tailwind families.
 */

const fmt = (n: number) => n.toLocaleString('en-US');

export function GameStrip({ game, skin, today }: { game: GameState; skin: TaskSkin; today: string }) {
  const level = levelFor(game.xp);
  const next = nextLevelAfter(game.xp);
  const progress = levelProgress(game.xp);
  const todayXp = dayOf(game, today).xp;
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl px-5 py-3 text-white shadow-md"
      style={{ backgroundColor: skin.ground }}>
      <div className="flex min-w-[14rem] flex-1 items-center gap-3">
        <LevelArt level={level.level} theme={game.theme} size={40} color={skin.accent} className="flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className={`truncate font-semibold ${skin.heading}`}>{levelTitle(level.level, game.theme)}</span>
            <span className="flex-shrink-0 text-xs text-[rgba(255,255,255,0.6)]">Level {level.level}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[rgba(255,255,255,0.14)]" role="progressbar"
            aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to the next level">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${progress}%`, background: skin.accent }} />
          </div>
          <p className="mt-0.5 text-[11px] text-[rgba(255,255,255,0.6)]">
            {fmt(game.xp)} XP{next ? ` · ${fmt(next.xp - game.xp)} to go` : ' · Top level'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5" title="Working days in a row with something finished">
        <Flame size={20} style={{ color: skin.accent }} />
        <span className="text-xl font-bold tabular-nums">{game.streak}</span>
        <span className="text-xs text-[rgba(255,255,255,0.6)]" data-es>{game.streak === 1 ? 'day' : 'days'}</span>
      </div>
      {game.rules === 'gentle' && (
        <div className="flex items-center gap-1 text-sm" title="Streak shields: each saves your streak once on a missed working day">
          <Shield size={16} style={{ color: skin.accent }} />
          <span className="tabular-nums">{game.shields}/{MAX_SHIELDS}</span>
        </div>
      )}
      <div className="rounded-full border border-[rgba(255,255,255,0.2)] bg-[rgba(0,0,0,0.25)] px-3 py-1 text-sm font-semibold tabular-nums">
        <span data-es>Today</span> {todayXp >= 0 ? '+' : ''}{fmt(todayXp)} XP
      </div>
    </div>
  );
}

/**
 * "Done", stamped. The word is the same in every theme — a theme changes how
 * things look, never what they say — and only the colour and face are its.
 * `fresh` plays the stamp landing; a pick that was already done on load just
 * shows it.
 */
export function DoneStamp({ skin, fresh }: { skin: TaskSkin; fresh: boolean }) {
  return (
    <span aria-hidden="true"
      className={`tt-stamp pointer-events-none absolute right-10 top-1/2 rounded-md border-[2.5px] border-green-600 bg-green-50 px-2 text-sm font-bold uppercase tracking-[0.14em] text-green-700 opacity-90 ${skin.heading} ${fresh ? 'tt-stamp-in' : ''}`}>
      Done
    </span>
  );
}

/**
 * A short burst of confetti over the whole page, then gone. `fire` changes to
 * start one. Nothing at all for somebody who asked their computer for less
 * motion.
 */
export function Confetti({ fire, colors }: { fire: number; colors: string[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!fire) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    const bits = Array.from({ length: 140 }, () => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.3,
      y: h * 0.35,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 13 - 4,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      s: 5 + Math.random() * 6,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    const started = performance.now();
    let frame = 0;
    const draw = (t: number) => {
      const age = t - started;
      ctx.clearRect(0, 0, w, h);
      for (const b of bits) {
        b.vy += 0.35;
        b.vx *= 0.99;
        b.x += b.vx;
        b.y += b.vy;
        b.r += b.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - age / 2400);
        ctx.translate(b.x, b.y);
        ctx.rotate(b.r);
        ctx.fillStyle = b.c;
        ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2);
        ctx.restore();
      }
      if (age < 2400) frame = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, w, h);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
    // Colours are read once per burst; a new array each render must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fire]);
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[70] h-full w-full" />;
}
