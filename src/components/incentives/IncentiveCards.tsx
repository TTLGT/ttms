'use client';

import { useState } from 'react';
import { Check, ChevronDown, ExternalLink, Minus, StickyNote } from 'lucide-react';
import { Bi, EsLine } from '@/components/spanish/Es';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { UserAvatar } from '@/components/settings/UserAvatar';
import ProgressRing from '@/components/onboarding/ProgressRing';
import {
  formatGoalValue,
  formatReward,
  goalRatio,
  goalState,
  remainingText,
  summarize,
  targetFor,
  type GoalState,
  type IncentiveGoal,
  type IncentiveLink,
  type IncentiveParticipant,
  type IncentiveProgram,
  type IncentiveProgress,
} from '@/types/incentive';

/**
 * The pieces every incentives screen draws with: a card per goal (what it
 * pays, where the person stands, what is left, how to get it) and a tile per
 * person for the scoreboard. Read-only — recording lives in RecordPanel.
 */

export const STATE_LABEL: Record<GoalState, string> = {
  met: 'Earned',
  partial: 'In progress',
  none: 'Not yet',
  unrecorded: 'Not recorded yet',
  na: 'Does not apply',
};

const STATE_STYLE: Record<GoalState, { card: string; badge: string; bar: string }> = {
  met:        { card: 'border-green-300 bg-green-50/60', badge: 'bg-green-600 text-white', bar: 'bg-green-500' },
  partial:    { card: 'border-amber-200 bg-white',       badge: 'bg-amber-100 text-amber-800', bar: 'bg-amber-500' },
  none:       { card: 'border-gray-200 bg-white',        badge: 'bg-gray-100 text-gray-700', bar: 'bg-gray-300' },
  unrecorded: { card: 'border-gray-200 bg-white',        badge: 'bg-gray-100 text-gray-500', bar: 'bg-gray-300' },
  na:         { card: 'border-dashed border-gray-200 bg-gray-50', badge: 'bg-gray-100 text-gray-500', bar: 'bg-gray-200' },
};

export function StateBadge({ state }: { state: GoalState }) {
  return (
    <span data-es className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${STATE_STYLE[state].badge}`}>
      {state === 'met' && <Check className="w-3 h-3" aria-hidden />}
      {STATE_LABEL[state]}
    </span>
  );
}

export function LinkList({ links }: { links: IncentiveLink[] }) {
  if (links.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {links.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50">
          {l.label} <ExternalLink className="w-3.5 h-3.5" aria-hidden />
        </a>
      ))}
    </div>
  );
}

/** Instructions, one step per line, numbered when there is more than one. */
export function HowTo({ text, textEs }: { text: string; textEs?: string }) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const linesEs = (textEs ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const List = lines.length > 1 ? 'ol' : 'div';
  return (
    <List className={`text-sm text-gray-700 space-y-1.5 ${lines.length > 1 ? 'list-decimal pl-5' : ''}`}>
      {lines.map((line, i) => (
        lines.length > 1
          ? <li key={i}>{line}<EsLine>{linesEs[i] ?? ''}</EsLine></li>
          : <p key={i}>{line}<EsLine>{linesEs[i] ?? ''}</EsLine></p>
      ))}
    </List>
  );
}

/**
 * One goal, for one person. `participant` and `progress` are absent on the
 * "How it works" tab, which shows the goal without anybody's standing.
 */
export function GoalCard({
  goal, index, program, participant, progress, openHow = false,
}: {
  goal: IncentiveGoal;
  index: number;
  program: IncentiveProgram;
  participant?: IncentiveParticipant;
  progress?: IncentiveProgress;
  /** Start with the instructions showing. */
  openHow?: boolean;
}) {
  const { formatDateTime } = useDateFormatters();
  const [showHow, setShowHow] = useState(openHow);
  const target = targetFor(goal, participant);
  const mark = progress?.marks[goal.id];
  const withPerson = Boolean(participant);
  const state = withPerson ? goalState(goal, target, mark) : 'unrecorded';
  const style = withPerson ? STATE_STYLE[state] : STATE_STYLE.none;
  const left = withPerson ? remainingText(goal, target, mark) : '';
  const ratio = withPerson ? goalRatio(goal, target, mark) : 0;

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${style.card}`}>
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900 leading-snug">
            {goal.title}
            <EsLine>{goal.titleEs ?? ''}</EsLine>
          </h3>
          {withPerson && <div className="mt-1"><StateBadge state={state} /></div>}
        </div>
        <span className="flex-shrink-0 rounded-lg bg-brand-50 px-2 py-1 text-sm font-bold text-brand-700 tabular-nums whitespace-nowrap">
          {formatReward(goal.reward, program.currency)}
        </span>
      </div>

      {/* Where they stand. A check goal has nothing to count, so no bar. */}
      {withPerson && goal.kind !== 'check' && state !== 'na' && (
        <div>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold text-gray-900 tabular-nums">
              {formatGoalValue(goal.kind, mark?.value)}
              <span className="font-normal text-gray-500">
                {' '}{goal.compare === 'above' ? 'vs.' : 'of'} {formatGoalValue(goal.kind, target)}
              </span>
            </span>
            {left && <span className="text-xs text-gray-600 text-right">{left}</span>}
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-gray-200 overflow-hidden" aria-hidden>
            <div className={`h-full rounded-full transition-all duration-700 ${style.bar}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
          </div>
          {goal.targetNote && <p className="mt-1 text-xs text-gray-500">{goal.targetNote}</p>}
        </div>
      )}
      {!withPerson && goal.kind !== 'check' && (
        <p className="text-sm text-gray-700">
          <span data-es className="text-gray-500">Target:</span>{' '}
          <span className="font-semibold">
            {goal.perPerson && goal.targetNote ? goal.targetNote : `${goal.compare === 'above' ? 'more than ' : ''}${formatGoalValue(goal.kind, goal.target)}`}
          </span>
        </p>
      )}

      {withPerson && mark?.note && (
        <p className="flex gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700 whitespace-pre-line">
          <StickyNote className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" aria-hidden />
          {mark.note}
        </p>
      )}

      {(goal.how || goal.links.length > 0) && (
        <div className="border-t border-gray-100 pt-2">
          <button type="button" onClick={() => setShowHow((v) => !v)}
            className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-brand-700"
            aria-expanded={showHow}>
            <span data-es>How to get it</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showHow ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          {showHow && (
            <div className="mt-2">
              <HowTo text={goal.how} textEs={goal.howEs} />
              <LinkList links={goal.links} />
            </div>
          )}
        </div>
      )}

      {withPerson && mark?.at && (
        <p className="text-[11px] text-gray-400 mt-auto">
          Updated by {mark.byName || 'someone'} · {formatDateTime(mark.at)}
        </p>
      )}
    </div>
  );
}

/** The summary at the top of somebody's own cards, or in the person dialog. */
export function PersonHeader({ program, participant, progress }: {
  program: IncentiveProgram;
  participant: IncentiveParticipant;
  progress?: IncentiveProgress;
}) {
  const s = summarize(program, participant, progress);
  const pct = s.possible > 0 ? Math.round((s.earned / s.possible) * 100) : 0;
  const left = s.counted - s.met;
  return (
    <div className="flex flex-wrap items-center gap-5 rounded-xl border border-gray-200 bg-white p-5">
      <ProgressRing percent={pct} size={96} label="earned" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-500">{participant.name}</p>
        <p className="text-3xl font-bold text-gray-900 tabular-nums">
          {formatReward(s.earned, program.currency)}
          <span className="text-base font-medium text-gray-500"> / {formatReward(s.possible, program.currency)}</span>
        </p>
        <p className="text-sm text-gray-600 mt-1">
          {s.met} of {s.counted} goals earned
          {left > 0 ? ` · ${left} still open` : s.counted > 0 ? ' · every goal earned' : ''}
        </p>
      </div>
    </div>
  );
}

/** One person on the scoreboard. A pip per goal, in goal order. */
export function PersonTile({ program, participant, progress, rank, onOpen, isMe }: {
  program: IncentiveProgram;
  participant: IncentiveParticipant;
  progress?: IncentiveProgress;
  rank: number;
  onOpen: () => void;
  isMe: boolean;
}) {
  const s = summarize(program, participant, progress);
  const pct = s.possible > 0 ? (s.earned / s.possible) * 100 : 0;
  return (
    <button type="button" onClick={onOpen}
      className={`text-left rounded-xl border bg-white p-4 hover:shadow-md hover:border-brand-300 transition-shadow ${isMe ? 'border-brand-400 ring-2 ring-brand-100' : 'border-gray-200'}`}>
      <div className="flex items-center gap-3">
        <span className="w-6 text-center text-xs font-bold text-gray-400 tabular-nums">{rank}</span>
        <UserAvatar photoPath={null} fallback={(participant.name[0] ?? '?').toUpperCase()} size={36} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 truncate">
            {participant.name}
            {isMe && <span data-es className="ml-1.5 text-xs font-medium text-brand-600">(you)</span>}
          </p>
          <p className="text-xs text-gray-500">{s.met} of {s.counted} goals</p>
        </div>
        <span className="text-right">
          <span className="block text-lg font-bold text-gray-900 tabular-nums">{formatReward(s.earned, program.currency)}</span>
        </span>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-gray-200 overflow-hidden" aria-hidden>
        <div className="h-full rounded-full bg-green-500 transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1" aria-label="Goals">
        {program.goals.map((goal, i) => {
          const state = goalState(goal, targetFor(goal, participant), progress?.marks[goal.id]);
          return (
            <span key={goal.id} title={`${i + 1}. ${goal.title} — ${STATE_LABEL[state]}`}
              className={`w-6 h-6 rounded-md text-[10px] font-bold flex items-center justify-center ${
                state === 'met' ? 'bg-green-500 text-white'
                : state === 'partial' ? 'bg-amber-100 text-amber-800'
                : state === 'na' ? 'bg-gray-50 text-gray-300 border border-dashed border-gray-200'
                : 'bg-gray-100 text-gray-500'}`}>
              {state === 'na' ? <Minus className="w-3 h-3" aria-hidden /> : i + 1}
            </span>
          );
        })}
      </div>
    </button>
  );
}

export function Intro({ program }: { program: IncentiveProgram }) {
  if (!program.intro) return null;
  return (
    <p className="text-sm text-gray-600 whitespace-pre-line">
      {program.intro}
      <EsLine>{program.introEs ?? ''}</EsLine>
    </p>
  );
}

/** "Nothing recorded yet" copy, shared by the empty states. */
export function NothingYet({ children }: { children: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
      <Bi>{children}</Bi>
    </div>
  );
}
