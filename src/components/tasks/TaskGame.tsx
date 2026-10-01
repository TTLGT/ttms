'use client';

import { useEffect, useState } from 'react';
import { PLAIN_SKIN, skinFor, type TaskSkin } from './taskSkins';
import { artUrl } from './taskSkinArt';
import { ChevronDown, ChevronUp, Flame, Plus, Target, Trophy, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import type { GameNotice } from '@/lib/personalTasks';
import { BROKER_SUGGESTIONS, suggestionsFor, type BrokerSuggestion } from '@/types/brokerSuggestions';
import {
  GAME_LEVELS,
  GAME_THEMES,
  SUGGESTION_BONUS_XP,
  TASK_XP,
  levelFor,
  levelProgress,
  levelTitle,
  missionDef,
  nextLevelAfter,
  type GameLevel,
  type GameState,
  type GameTheme,
  type MissionSet,
} from '@/types/taskGame';
import { TASK_PRIORITY_LABEL, calendarToday, type PersonalTaskInput } from '@/types/task';

/**
 * Game mode on My tasks — see src/types/taskGame.ts for the rules.
 *
 * The bar is what is always on screen while it is on; everything else —
 * missions, suggestions, recent XP, the theme — opens under it, so the board
 * stays where it was for somebody who only wants to see the number go up.
 */

const fmt = (n: number) => n.toLocaleString('en-US');

export function GameBar({
  game,
  skin = PLAIN_SKIN,
  onAddSuggestion,
  onOptions,
}: {
  game: GameState;
  skin?: TaskSkin;
  onAddSuggestion: (input: PersonalTaskInput) => void;
  onOptions: (options: { enabled?: boolean; theme?: GameTheme }) => void;
}) {
  const [open, setOpen] = useState(false);
  const level = levelFor(game.xp);
  const next = nextLevelAfter(game.xp);
  const title = levelTitle(level.level, game.theme);
  const openMissions = [...(game.daily?.missions ?? []), ...(game.weekly?.missions ?? [])].filter((m) => !m.done).length;

  const week = game.weekly?.missions ?? [];
  const weekDone = week.filter((m) => m.done).length;
  const progress = levelProgress(game.xp);
  /** Controls on the banner: a translucent white over whatever ground the theme has. */
  const onBanner = 'border border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.08)] text-white hover:bg-[rgba(255,255,255,0.14)]';

  return (
    <div className="mb-4">
      {/*
        The banner. Its colours are fixed hex, the same in light and dark
        mode — it is a dark panel in both — so nothing in it uses the
        theme-mapped Tailwind families. The artwork sits on the right at the
        banner's full height; the words stay in the left 60%, where the
        drawing has already faded to the plain ground.
      */}
      <div
        className="overflow-hidden rounded-xl text-white shadow-lg ring-1 ring-[rgba(255,255,255,0.08)]"
        style={{ backgroundColor: skin.ground }}
      >
        <div
          style={game.enabled ? {
            backgroundImage: artUrl(game.theme),
            backgroundSize: 'auto 100%',
            backgroundPosition: 'right center',
            backgroundRepeat: 'no-repeat',
          } : undefined}
        >
          <div className="flex min-h-[156px] flex-col justify-center gap-4 px-6 py-5 md:max-w-[62%]">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[rgba(255,255,255,0.55)]">
                {GAME_THEMES[game.theme].label} · Game mode
              </p>
              <h2 className={`mt-1 text-3xl font-bold leading-tight ${skin.font}`}>{skin.tagline}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <div className="flex min-w-[15rem] flex-1 items-center gap-3">
                <span
                  aria-hidden
                  className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full border-2 text-lg"
                  style={{ borderColor: skin.accent, color: skin.accent, background: 'rgba(255,255,255,0.06)' }}
                >
                  {level.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold">{title}</span>
                    <span className="flex-shrink-0 text-xs text-[rgba(255,255,255,0.6)]">Level {level.level}</span>
                  </div>
                  <div
                    className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[rgba(255,255,255,0.14)]"
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Progress to the next level"
                  >
                    <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: skin.accent }} />
                  </div>
                  <p className="mt-1 text-[11px] text-[rgba(255,255,255,0.6)]">
                    {fmt(game.xp)} XP
                    {next ? ` · ${fmt(next.xp - game.xp)} to ${levelTitle(next.level, game.theme)}` : ' · Top level'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2" title={`Longest: ${game.longestStreak} days`}>
                <Flame size={22} style={{ color: game.streak > 0 ? skin.accent : 'rgba(255,255,255,0.3)' }} />
                <div>
                  <p className="text-xl font-semibold leading-none">{game.streak}</p>
                  <p className="text-[11px] text-[rgba(255,255,255,0.6)]">day streak</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.05)] px-6 py-2.5 text-sm">
          <span className="text-[rgba(255,255,255,0.6)]">
            {week.length > 0 ? `${weekDone} of ${week.length} ${skin.missions.toLowerCase()} done this week` : 'Finish a task to start this week’s ' + skin.missions.toLowerCase()}
          </span>
          <label className="ml-auto inline-flex items-center gap-2 text-[rgba(255,255,255,0.6)]">
            Theme
            <select
              value={game.theme}
              onChange={(e) => onOptions({ theme: e.target.value as GameTheme })}
              // Dark so the browser draws its own list dark too, to match the banner.
              style={{ colorScheme: 'dark' }}
              className={`rounded-md px-2 py-1 text-sm ${onBanner}`}
            >
              {(Object.keys(GAME_THEMES) as GameTheme[]).map((t) => (
                <option key={t} value={t}>{GAME_THEMES[t].label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm ${onBanner}`}
          >
            <Target size={14} /> {skin.missions}
            {openMissions > 0 && (
              <span className="rounded-full px-1.5 text-xs font-semibold" style={{ background: skin.accent, color: skin.ground }}>
                {openMissions}
              </span>
            )}
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-2 grid gap-6 rounded-xl border border-gray-200 bg-white px-5 py-4 lg:grid-cols-3">
          <div className="space-y-4">
            <MissionList heading="Today" set={game.daily} />
            <MissionList heading="This week" set={game.weekly} />
          </div>
          <Suggestions onAdd={onAddSuggestion} />
          <div className="space-y-4">
            <RecentXp game={game} />
            <GameOptions game={game} onOptions={onOptions} />
          </div>
        </div>
      )}
    </div>
  );
}

function MissionList({ heading, set }: { heading: string; set: MissionSet | null }) {
  const missions = set?.missions ?? [];
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{heading}</h3>
      {missions.length === 0 ? (
        <p className="text-sm text-gray-500">New missions arrive when you next finish or add a task.</p>
      ) : (
        <ul className="space-y-2">
          {missions.map((m) => {
            const def = missionDef(m.id);
            if (!def) return null;
            return (
              <li key={m.id} className={m.done ? 'opacity-60' : ''}>
                <div className="flex items-baseline gap-2 text-sm">
                  <span className={`flex-1 font-medium text-gray-900 ${m.done ? 'line-through' : ''}`}>{def.title}</span>
                  <span className="text-xs text-brand-700">+{def.xp} XP</span>
                </div>
                <p className="text-xs text-gray-500">{def.desc}</p>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full ${m.done ? 'bg-green-500' : 'bg-brand-400'}`}
                      style={{ width: `${Math.round((m.progress / def.target) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-gray-500">{m.progress}/{def.target}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Suggestions({ onAdd }: { onAdd: (input: PersonalTaskInput) => void }) {
  const { user } = useAuth();
  const [all, setAll] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  // Today's three, read after mount: the date is the office's, and a server
  // render would bake in the day it was built.
  const [today, setToday] = useState('');
  useEffect(() => { setToday(calendarToday()); }, []);

  const list = all ? BROKER_SUGGESTIONS : user && today ? suggestionsFor(user.uid, today) : [];

  const add = (s: BrokerSuggestion) => {
    onAdd({ title: s.title, notes: s.hint, priority: s.priority, suggestionId: s.id, date: today || null });
    setAdded((a) => [...a, s.id]);
  };

  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {all ? 'Broker task ideas' : 'Suggested for today'}
      </h3>
      <p className="mb-2 text-xs text-gray-500">
        Each is worth its priority's XP plus {SUGGESTION_BONUS_XP} bonus, and counts for the &ldquo;suggested&rdquo; missions.
      </p>
      <ul className={`space-y-1.5 ${all ? 'max-h-80 overflow-y-auto pr-1' : ''}`}>
        {list.map((s) => (
          <li key={s.id} className="flex items-start gap-2 rounded-lg border border-gray-100 px-2.5 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-900">{s.title}</p>
              <p className="text-xs text-gray-500">
                {TASK_PRIORITY_LABEL[s.priority]} · {TASK_XP[s.priority] + SUGGESTION_BONUS_XP} XP
              </p>
            </div>
            <button
              type="button"
              onClick={() => add(s)}
              disabled={added.includes(s.id)}
              className="inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:bg-gray-200 disabled:text-gray-500"
            >
              {added.includes(s.id) ? 'Added' : <><Plus size={12} /> Add</>}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setAll((a) => !a)} className="mt-2 text-xs text-brand-700 hover:underline">
        {all ? 'Show only today\'s three' : `See all ${BROKER_SUGGESTIONS.length} ideas`}
      </button>
    </section>
  );
}

function RecentXp({ game }: { game: GameState }) {
  const recent = [...game.log].reverse().slice(0, 8);
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Recent XP</h3>
      {recent.length === 0 ? (
        <p className="text-sm text-gray-500">Finish a task to earn your first XP.</p>
      ) : (
        <ul className="space-y-1">
          {recent.map((e, i) => (
            <li key={`${e.at}-${i}`} className="flex gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-gray-700">{e.label}</span>
              <span className={`font-medium ${e.xp < 0 ? 'text-red-600' : 'text-green-700'}`}>
                {e.xp > 0 ? '+' : ''}{e.xp}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-gray-500">
        {game.tasksDone} tasks finished · {game.missionsDone} missions · longest streak {game.longestStreak} days
      </p>
    </section>
  );
}

function GameOptions({
  game,
  onOptions,
}: {
  game: GameState;
  onOptions: (options: { enabled?: boolean; theme?: GameTheme }) => void;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Your theme</h3>
      <p className="text-[11px] text-gray-500">
        {GAME_THEMES[game.theme].label}: the look of this page and the name of every level, up to level 30,{' '}
        {levelTitle(GAME_LEVELS.length, game.theme)}. Changing it keeps your XP and level.
      </p>
      <details className="mt-3 text-xs text-gray-500">
        <summary className="cursor-pointer">How XP works</summary>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
          <li>Finishing a task: {TASK_XP.low} / {TASK_XP.normal} / {TASK_XP.high} XP for low, normal and high priority.</li>
          <li>Finished late: 75% up to 3 days late, 50% up to a week, then 25%.</li>
          <li>First task of each day: +50 XP and your streak grows. Only Monday to Friday count.</li>
          <li>Your streak is frozen on weekends, Guatemalan holidays and days you have asked for time off (waiting or approved).</li>
          <li>Each weekday a task is overdue costs 5 XP per day late, up to what it is worth. Nothing is charged on a day off.</li>
          <li>Missing a weekday you were working breaks the streak and costs 25 XP per day of it, up to 300.</li>
          <li>Reopening a finished task takes back what it earned. Losing XP can lose you a level.</li>
          <li>Only you can see any of this.</li>
        </ul>
      </details>
      <button
        type="button"
        onClick={() => onOptions({ enabled: false })}
        className="mt-3 text-xs text-gray-500 hover:text-red-600"
      >
        Turn game mode off
      </button>
    </section>
  );
}

/**
 * The toasts and the level-up and level-down moments. Rendered on every page
 * that saves tasks, so finishing one from the calendar still says what it was
 * worth.
 */
export function GameFeedback({
  notices,
  theme,
  onDismiss,
}: {
  notices: GameNotice[];
  theme: GameTheme;
  onDismiss: (id: number) => void;
}) {
  const level = notices.find((n) => n.event.kind === 'level');
  const toasts = notices.filter((n) => n.event.kind !== 'level').slice(-4);

  // Each toast goes by itself, oldest first; a level change waits for its button.
  const oldest = toasts[0]?.id;
  useEffect(() => {
    if (oldest === undefined) return;
    const timer = window.setTimeout(() => onDismiss(oldest), 3500);
    return () => window.clearTimeout(timer);
  }, [oldest, onDismiss]);

  return (
    <>
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map(({ id, event }) => {
          if (event.kind === 'xp') {
            const lost = event.amount < 0;
            return (
              <div
                key={id}
                className={`pointer-events-auto rounded-full px-4 py-2 text-sm font-medium shadow-lg ${
                  lost ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'
                }`}
              >
                {lost ? '' : '+'}{event.amount} XP · {event.label}
              </div>
            );
          }
          if (event.kind === 'mission') {
            return (
              <div key={id} className="pointer-events-auto flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 shadow-lg">
                <Trophy size={14} /> {event.weekly ? 'Weekly' : 'Daily'} mission done: {event.title} · +{event.xp} XP
              </div>
            );
          }
          return null;
        })}
      </div>

      {level && level.event.kind === 'level' && (
        <LevelMoment
          level={GAME_LEVELS[level.event.level - 1]}
          up={level.event.up}
          theme={theme}
          onClose={() => onDismiss(level.id)}
        />
      )}
    </>
  );
}

function LevelMoment({
  level,
  up,
  theme,
  onClose,
}: {
  level: GameLevel;
  up: boolean;
  theme: GameTheme;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const skin = skinFor(theme);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={up ? 'Level up' : 'Level down'}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-white text-center shadow-2xl"
      >
        {/* The theme's banner in miniature: same ground, same drawing, same fixed colours. */}
        <div
          className="relative px-8 pb-6 pt-8 text-white"
          style={{
            backgroundColor: skin.ground,
            backgroundImage: artUrl(theme),
            backgroundSize: 'cover',
            backgroundPosition: 'right center',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 rounded p-1 text-[rgba(255,255,255,0.6)] hover:text-white"
          >
            <X size={18} />
          </button>
          <span
            aria-hidden
            className="mx-auto grid h-20 w-20 place-items-center rounded-full border-2 text-4xl"
            style={{ borderColor: up ? skin.accent : '#f87171', color: up ? skin.accent : '#f87171', background: 'rgba(255,255,255,0.06)' }}
          >
            {level.icon}
          </span>
          <p className={`mt-4 text-3xl font-bold ${skin.font}`}>{up ? 'Level up' : 'Level down'}</p>
        </div>
        <div className="px-8 pb-7 pt-5">
          <p className="text-sm text-gray-600">
            {up ? 'You are now' : 'You dropped to'} level {level.level}
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{levelTitle(level.level, theme)}</p>
          <button
            type="button"
            onClick={onClose}
            className={`mt-6 w-full rounded-lg px-4 py-2 text-sm font-medium ${
              up ? skin.button : 'bg-red-600 text-white hover:bg-red-700'
            }`}
          >
            {up ? 'Keep going' : 'Win it back'}
          </button>
        </div>
      </div>
    </div>
  );
}
