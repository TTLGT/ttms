'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Crown, Gift, Trophy, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Bi, EsLine } from '@/components/spanish/Es';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { fetchMonth, type MonthView } from '@/lib/incentives';
import {
  GoalCard, HowTo, Intro, LinkList, NothingYet, PersonHeader, PersonTile,
} from '@/components/incentives/IncentiveCards';
import RecordPanel from '@/components/incentives/RecordPanel';
import ProgramEditor from '@/components/incentives/ProgramEditor';
import {
  formatGoalValue,
  formatReward,
  maxReward,
  monthLabel,
  prizeRanking,
  shiftMonth,
  summarize,
  type IncentiveProgram,
  type IncentiveProgress,
} from '@/types/incentive';

type Tab = 'mine' | 'everyone' | 'rules' | 'record' | 'setup';

/**
 * Incentives: the month's goals, everybody's progress on them, and — for the
 * people who run it — recording and setting a month up. Everybody signed in
 * sees every card, by the office's choice; see src/types/incentive.ts.
 *
 * The month and tab live in the URL so a link to "November, Everyone" can be
 * pasted into chat.
 */
function IncentivesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { formatDateTime } = useDateFormatters();
  const [view, setView] = useState<MonthView | null>(null);
  const [error, setError] = useState('');
  const [openUid, setOpenUid] = useState<string | null>(null);
  const [previous, setPrevious] = useState<IncentiveProgram | null>(null);

  const monthParam = params.get('month') ?? '';
  const tabParam = params.get('tab') as Tab | null;

  const setParams = useCallback((patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    router.replace(`${pathname}${next.toString() ? `?${next}` : ''}`, { scroll: false });
  }, [params, pathname, router]);

  useEffect(() => {
    let live = true;
    setError('');
    fetchMonth(monthParam || undefined)
      .then((v) => { if (live) setView(v); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : 'Could not load incentives'); });
    return () => { live = false; };
  }, [monthParam]);

  const program = view?.program ?? null;
  const progress = useMemo(() => view?.progress ?? [], [view]);
  const byUid = useMemo(() => new Map(progress.map((p) => [p.uid, p])), [progress]);
  const me = program?.participants.find((p) => p.uid === user?.uid);
  const abilities = view?.abilities;
  const mayRecord = Boolean(abilities && (abilities.recordAll || abilities.recordUids.length > 0));

  const tabs: { id: Tab; label: string }[] = [
    ...(me ? [{ id: 'mine' as const, label: 'My progress' }] : []),
    ...(program ? [{ id: 'everyone' as const, label: 'Everyone' }, { id: 'rules' as const, label: 'How it works' }] : []),
    ...(program && mayRecord ? [{ id: 'record' as const, label: 'Record' }] : []),
    ...(abilities?.manage ? [{ id: 'setup' as const, label: 'Set up' }] : []),
  ];
  const tab: Tab | null = tabs.some((t) => t.id === tabParam) ? tabParam : tabs[0]?.id ?? null;

  // The latest earlier month, offered by the set-up screen as a starting point.
  useEffect(() => {
    setPrevious(null);
    if (!view || view.program || !view.abilities.manage) return;
    const earlier = view.months.find((m) => m < view.month);
    if (earlier) fetchMonth(earlier).then((v) => setPrevious(v.program)).catch(() => {});
  }, [view]);

  function updateProgress(p: IncentiveProgress) {
    setView((v) => v && { ...v, progress: [...v.progress.filter((x) => x.uid !== p.uid), p] });
  }

  const month = view?.month ?? monthParam;
  // Anybody can step through months that have something in them; somebody who
  // sets months up can also step to an empty one, to set it up.
  const stepTo = (by: number) => {
    if (!view) return;
    if (view.abilities.manage) { setParams({ month: shiftMonth(view.month, by) }); return; }
    const all = [...new Set([...view.months, view.current])].sort();
    const i = all.indexOf(view.month);
    const next = all[i + by];
    if (next) setParams({ month: next });
  };
  const canStep = (by: number) => {
    if (!view) return false;
    if (view.abilities.manage) return true;
    const all = [...new Set([...view.months, view.current])].sort();
    const i = all.indexOf(view.month);
    return i + by >= 0 && i + by < all.length;
  };

  const ranked = useMemo(() => {
    if (!program) return [];
    return [...program.participants]
      .map((p) => ({ p, s: summarize(program, p, byUid.get(p.uid)) }))
      .sort((a, b) => b.s.earned - a.s.earned || b.s.met - a.s.met || a.p.name.localeCompare(b.p.name));
  }, [program, byUid]);

  const opened = program?.participants.find((p) => p.uid === openUid);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Trophy className="w-6 h-6 text-gray-500" aria-hidden /> <Bi>Incentives</Bi>
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            <Bi>This month’s goals, what each one pays, and where everybody stands.</Bi>
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1">
          <button type="button" onClick={() => stepTo(-1)} disabled={!canStep(-1)} aria-label="Previous month"
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
          <span className="min-w-[9rem] text-center text-sm font-semibold text-gray-900">{month ? monthLabel(month) : '…'}</span>
          <button type="button" onClick={() => stepTo(1)} disabled={!canStep(1)} aria-label="Next month"
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
          {view && view.month !== view.current && (
            <button type="button" onClick={() => setParams({ month: '' })} data-es
              className="ml-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50">This month</button>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600 mb-4">{error}</div>}

      {!view && !error && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {view && (
        <>
          {/* ── The month's banner ─────────────────────────────────── */}
          {program && (
            // Fixed colours, written inline: the theme remaps brand, blue,
            // amber and white in dark mode, and this banner is dark navy in
            // every theme, like the task-game banner.
            <div className="relative overflow-hidden rounded-2xl p-5 sm:p-6 mb-5"
              style={{ background: 'linear-gradient(135deg, #0f1f4a 0%, #1e3a8a 100%)', color: '#ffffff' }}>
              <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} aria-hidden />
              <div className="absolute right-16 -bottom-16 w-40 h-40 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} aria-hidden />
              <div className="relative flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#bfdbfe' }}>{monthLabel(program.month)}</p>
                  <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
                    {program.title}
                    <EsLine className="!text-[#dbeafe]">{program.titleEs ?? ''}</EsLine>
                  </h2>
                  {program.intro && (
                    <p className="mt-1 text-sm whitespace-pre-line" style={{ color: '#dbeafe' }}>
                      {program.intro}
                      <EsLine className="!text-[#dbeafe]">{program.introEs ?? ''}</EsLine>
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="rounded-xl px-4 py-3 text-center" style={{ background: 'rgba(255,255,255,0.12)' }}>
                    <p data-es className="text-[11px] uppercase tracking-wide" style={{ color: '#bfdbfe' }}>Up to</p>
                    <p className="text-2xl font-bold tabular-nums">{formatReward(maxReward(program), program.currency)}</p>
                  </div>
                  <div className="rounded-xl px-4 py-3 text-center" style={{ background: 'rgba(255,255,255,0.12)' }}>
                    <p data-es className="text-[11px] uppercase tracking-wide" style={{ color: '#bfdbfe' }}>Goals</p>
                    <p className="text-2xl font-bold tabular-nums">{program.goals.length}</p>
                  </div>
                  {program.prize && (
                    <div className="rounded-xl px-4 py-3 text-center max-w-[12rem]" style={{ background: '#fbbf24', color: '#111827' }}>
                      <p data-es className="text-[11px] uppercase tracking-wide font-semibold">Plus a prize</p>
                      <p className="text-sm font-bold leading-tight">{program.prize.description || program.prize.title}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {!program && !abilities?.manage && (
            <NothingYet>There are no incentives for this month yet.</NothingYet>
          )}

          {/* ── Tabs ───────────────────────────────────────────────── */}
          {tabs.length > 1 && (
            <div className="flex gap-1 overflow-x-auto border-b border-gray-200 mb-5" role="tablist">
              {tabs.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} data-es
                  onClick={() => setParams({ tab: t.id })}
                  className={`px-4 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px ${tab === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {/* ── My progress ────────────────────────────────────────── */}
          {tab === 'mine' && program && me && (
            <div className="space-y-4">
              <PersonHeader program={program} participant={me} progress={byUid.get(me.uid)} />
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {program.goals.map((g, i) => (
                  <GoalCard key={g.id} goal={g} index={i} program={program} participant={me} progress={byUid.get(me.uid)} />
                ))}
              </div>
              {program.prize && <PrizeCard program={program} progress={progress} myUid={me.uid} />}
            </div>
          )}

          {/* ── Everyone ───────────────────────────────────────────── */}
          {tab === 'everyone' && program && (
            <div className="space-y-5">
              {program.prize && <PrizeCard program={program} progress={progress} myUid={user?.uid} />}
              {ranked.length === 0 ? (
                <NothingYet>Nobody is taking part this month yet.</NothingYet>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {ranked.map(({ p }, i) => (
                    <PersonTile key={p.uid} program={program} participant={p} progress={byUid.get(p.uid)}
                      rank={i + 1} isMe={p.uid === user?.uid} onOpen={() => setOpenUid(p.uid)} />
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-500"><Bi>Sorted by amount earned. Click anybody to see their cards.</Bi></p>
            </div>
          )}

          {/* ── How it works ───────────────────────────────────────── */}
          {tab === 'rules' && program && (
            <div className="space-y-4">
              <Intro program={program} />
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {program.goals.map((g, i) => (
                  <GoalCard key={g.id} goal={g} index={i} program={program} openHow />
                ))}
              </div>
              {program.prize && <PrizeCard program={program} progress={progress} myUid={user?.uid} showHow />}
            </div>
          )}

          {/* ── Record ─────────────────────────────────────────────── */}
          {tab === 'record' && program && abilities && (
            <RecordPanel month={view.month} program={program} progress={progress} abilities={abilities} onSaved={updateProgress} />
          )}

          {/* ── Set up ─────────────────────────────────────────────── */}
          {tab === 'setup' && abilities?.manage && (
            <>
              {program?.updatedAt && (
                <p className="text-xs text-gray-500 mb-3">
                  Last saved by {program.updatedByName ?? 'someone'} · {formatDateTime(program.updatedAt)}
                </p>
              )}
              <ProgramEditor month={view.month} program={program} previous={previous}
                onSaved={(p) => setView((v) => v && {
                  ...v, program: p,
                  months: v.months.includes(p.month) ? v.months : [...v.months, p.month].sort().reverse(),
                })} />
            </>
          )}
        </>
      )}

      {/* ── One person's cards ───────────────────────────────────── */}
      {opened && program && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
          onClick={() => setOpenUid(null)} role="dialog" aria-modal="true" aria-label={opened.name}>
          <div className="w-full max-w-5xl rounded-2xl bg-gray-50 p-4 sm:p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end mb-2">
              <button type="button" onClick={() => setOpenUid(null)} aria-label="Close"
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-200"><X className="w-5 h-5" /></button>
            </div>
            <PersonHeader program={program} participant={opened} progress={byUid.get(opened.uid)} />
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {program.goals.map((g, i) => (
                <GoalCard key={g.id} goal={g} index={i} program={program} participant={opened} progress={byUid.get(opened.uid)} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** The prize and its standings. Nobody is ranked until a number is recorded for them. */
function PrizeCard({ program, progress, myUid, showHow = false }: {
  program: IncentiveProgram;
  progress: IncentiveProgress[];
  myUid?: string;
  showHow?: boolean;
}) {
  const prize = program.prize!;
  const ranking = prizeRanking(program, progress);
  const names = new Map(program.participants.map((p) => [p.uid, p.name]));
  const mine = ranking.find((r) => r.uid === myUid);
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-amber-400 text-gray-900">
          <Gift className="w-6 h-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p data-es className="text-xs font-semibold uppercase tracking-wide text-amber-700">Prize</p>
          <h3 className="text-lg font-bold text-gray-900">{prize.title}<EsLine>{prize.titleEs ?? ''}</EsLine></h3>
          {prize.description && <p className="text-sm text-gray-700">{prize.description}</p>}
          {mine && <p className="mt-1 text-sm font-semibold text-amber-800">You are #{mine.place} with {formatGoalValue(prize.kind, mine.value)}</p>}
        </div>
        <div className="w-full sm:w-72">
          {ranking.length === 0 ? (
            <p className="text-sm text-gray-500"><Bi>Nobody’s number is recorded yet.</Bi></p>
          ) : (
            <ol className="space-y-1">
              {ranking.slice(0, 5).map((r) => (
                <li key={r.uid} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${r.uid === myUid ? 'bg-white font-semibold' : ''}`}>
                  <span className="w-5 text-center text-xs font-bold text-gray-500">{r.place}</span>
                  {r.place === 1 && <Crown className="w-4 h-4 text-amber-500" aria-label="Leading" />}
                  <span className="truncate flex-1 text-gray-900">{names.get(r.uid)}</span>
                  <span className="tabular-nums text-gray-700">{formatGoalValue(prize.kind, r.value)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
      {showHow && (prize.how || prize.links.length > 0) && (
        <div className="mt-4 border-t border-amber-200 pt-3">
          <HowTo text={prize.how} textEs={prize.howEs} />
          <LinkList links={prize.links} />
        </div>
      )}
    </div>
  );
}

export default function IncentivesPage() {
  return (
    <Suspense fallback={null}>
      <IncentivesScreen />
    </Suspense>
  );
}
