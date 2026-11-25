'use client';

import { useEffect, useRef, useState } from 'react';
import { Flame, Shield } from 'lucide-react';
import { LevelArt } from './LevelArt';
import type { TaskSkin } from './taskSkins';
import { SCENE_THEMES, STOP_X, createScene, type SceneController } from './gameSceneArt';
import {
  GAME_THEMES, MAX_SHIELDS, dayOf, hasUnlock, levelFor, levelProgress, levelTitle, nextLevelAfter, type GameState,
} from '@/types/taskGame';

/**
 * Game mode's rewards on the Planner's Today tab (step 7 of the redesign):
 *
 *  - `GameScene` — the theme's animated scene, with the level, XP, streak
 *    and today's XP over it and the day's route (a stop per pick) under it.
 *  - `DoneStamp` — "Done" stamped across a finished pick.
 *  - `Confetti` — once, when the last of Today's 3 is ticked.
 *
 * All of it is drawing. XP is never worked out here: the numbers are the
 * ones the server sent back with the save (src/types/taskGame.ts).
 *
 * Fixed colours on the scene, like the banner: it is a dark panel in every
 * app theme, so nothing in it uses the theme-mapped Tailwind families.
 */

const fmt = (n: number) => n.toLocaleString('en-US');

/**
 * The Today scene: the theme's animated picture (gameSceneArt.ts), with the
 * level, XP, streak and today's XP over its top edge and the day's route
 * along the bottom — a start and one stop per pick, each lit as its pick is
 * finished, the vehicle travelling to it. Reaching a stop says so across the
 * scene for a moment; reaching the last says the route is complete.
 *
 * The route's words (stop names, "On the road") are the scene's captions.
 * What the buttons and statuses say is the same in every theme.
 */
export function GameScene({ game, skin, today, planned, reached }: {
  game: GameState;
  skin: TaskSkin;
  today: string;
  /** Whether Today's 3 has anything in it yet. */
  planned: boolean;
  /** How many picks are done, 0–3. */
  reached: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scene = useRef<SceneController | null>(null);
  const look = SCENE_THEMES[game.theme];
  const unlocked = hasUnlock(game);
  const level = levelFor(game.xp);
  const next = nextLevelAfter(game.xp);
  const progress = levelProgress(game.xp);
  const todayXp = dayOf(game, today).xp;
  const stop = Math.max(0, Math.min(3, reached));

  useEffect(() => {
    if (!boxRef.current || !canvasRef.current) return;
    scene.current = createScene(boxRef.current, canvasRef.current);
    return () => { scene.current?.destroy(); scene.current = null; };
  }, []);
  useEffect(() => { scene.current?.set({ theme: game.theme, reached: stop, unlocked }); }, [game.theme, stop, unlocked]);

  // A stop reached on this visit gets its moment; loading a day already
  // under way just shows where the vehicle is.
  const [banner, setBanner] = useState<{ key: number; text: string } | null>(null);
  const lastStop = useRef<number | null>(null);
  useEffect(() => {
    const before = lastStop.current;
    lastStop.current = stop;
    if (before === null || stop <= before) return;
    setBanner({ key: Date.now(), text: stop >= 3 ? look.complete : look.stops[stop] });
    const t = window.setTimeout(() => setBanner(null), 2600);
    return () => window.clearTimeout(t);
  }, [stop, look]);

  const route = !planned ? look.idle : stop >= 3 ? look.complete : `${look.start} · ${stop} of 3`;

  return (
    <div ref={boxRef} className="relative mb-5 h-[230px] overflow-hidden rounded-xl text-white shadow-md sm:h-[250px]"
      style={{ background: look.ground }}>
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" role="img"
        aria-label={`${GAME_THEMES[game.theme].label} scene: ${route}`} />

      <div className="absolute inset-x-0 top-0 z-[2] flex flex-wrap items-center gap-x-6 gap-y-2 bg-gradient-to-b from-[rgba(0,0,0,0.5)] to-transparent px-4 pb-6 pt-3">
        <div className="flex min-w-[13rem] flex-1 items-center gap-3">
          <LevelArt level={level.level} theme={game.theme} size={40} color={look.accent} className="flex-shrink-0" />
          <div className="min-w-0 max-w-[16rem] flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className={`truncate font-semibold drop-shadow ${skin.heading}`}>{levelTitle(level.level, game.theme)}</span>
              <span className="flex-shrink-0 text-xs text-[rgba(255,255,255,0.7)]">Level {level.level}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[rgba(255,255,255,0.18)]" role="progressbar"
              aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to the next level">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${progress}%`, background: look.accent }} />
            </div>
            <p className="mt-0.5 text-[11px] text-[rgba(255,255,255,0.75)]">
              {fmt(game.xp)} XP{next ? ` · ${fmt(next.xp - game.xp)} to ${levelTitle(next.level, game.theme)}` : ' · Top level'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5" title="Working days in a row with something finished">
          <Flame size={20} style={{ color: look.accent }} />
          <span className="text-xl font-bold tabular-nums">{game.streak}</span>
          <span className="text-xs text-[rgba(255,255,255,0.7)]" data-es>{game.streak === 1 ? 'day' : 'days'}</span>
        </div>
        {game.rules === 'gentle' && (
          <div className="flex items-center gap-1 text-sm" title="Streak shields: each saves your streak once on a missed working day">
            <Shield size={16} style={{ color: look.accent }} />
            <span className="tabular-nums">{game.shields}/{MAX_SHIELDS}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[rgba(255,255,255,0.2)] bg-[rgba(0,0,0,0.35)] px-3 py-1 text-xs font-semibold">{route}</span>
          <span className="rounded-full border border-[rgba(255,255,255,0.2)] bg-[rgba(0,0,0,0.35)] px-3 py-1 text-xs font-semibold tabular-nums">
            <span data-es>Today</span> {todayXp >= 0 ? '+' : ''}{fmt(todayXp)} XP
          </span>
        </div>
      </div>

      {/* The journey map: the start and a stop per pick, under the vehicle's
          wheels so the vehicle never covers a name. */}
      {look.stops.map((name, i) => {
        const hit = i > 0 && i <= stop;
        return (
          <div key={name} className="pointer-events-none absolute bottom-1 z-[2] flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[rgba(0,0,0,0.5)] py-px pl-1 pr-2"
            style={{ left: `${STOP_X[i] * 100}%` }}>
            <span className="h-3 w-3 rounded-full border-2"
              style={hit
                ? { background: look.accent, borderColor: look.accent, boxShadow: `0 0 10px ${look.accent}` }
                : { borderColor: 'rgba(255,255,255,0.65)', background: 'rgba(0,0,0,0.45)' }} />
            <span className={`whitespace-nowrap text-[10px] font-bold uppercase tracking-wider sm:text-[11px] ${hit ? 'text-white' : 'text-[rgba(255,255,255,0.75)]'}`}>
              {name}
            </span>
          </div>
        );
      })}

      {banner && (
        <div key={banner.key} aria-live="polite"
          className={`tt-scene-banner pointer-events-none absolute left-1/2 top-[48%] z-[3] whitespace-nowrap text-3xl font-bold sm:text-4xl ${skin.heading}`}
          style={{ color: look.accent, textShadow: '0 2px 0 rgba(0,0,0,.5), 0 0 24px rgba(0,0,0,.4)' }}>
          {banner.text}
        </div>
      )}
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
