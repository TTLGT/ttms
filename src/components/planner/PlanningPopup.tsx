'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft, Building2, CalendarClock, Check, CheckCircle2, Circle, Clock, Coffee, GraduationCap, Inbox, ListChecks, Plus, Sparkles, Sun, Truck, X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { createMyTask, listMyTasks, saveMyTodayPicks, updateMyTask } from '@/lib/personalTasks';
import { getMyPlanningDay } from '@/lib/planning';
import { answerDayPlan, answerDayPlanWithGame, cachedDayPlan, getDayPlan, getPlanSuggestions, shareDayPlan, type DayPlanReply } from '@/lib/dailyPlan';
import { recordTour, tourSeen } from '@/lib/planner';
import { useDateFormatters } from '@/lib/useDateFormatters';
import PlannerTour, { POPUP_TOUR } from './PlannerTour';
import { SalesTargetsCard, TargetSteppers } from './SalesTargets';
import { setTodayTargets, useMySalesDay } from '@/lib/salesDay';
import type { SalesTargets } from '@/types/salesDay';
import { Bi } from '@/components/spanish/Es';
import { MAX_TASK_TITLE, formatTime, isOverdue, occursOn, type PersonalTask } from '@/types/task';
import { MAX_TODAY_PICKS, canPickForToday, picksIn, tasksForToday } from '@/types/planner';
import { PLANNING_ASK_EVENT, addMinutes, freeStarts, officeNowTime, shiftQuarterHours, type DayItem, type PlanningDay } from '@/types/planning';
import { nextWorkingDay } from '@/types/dayPlan';
import { dayOf, levelFor, levelTitle, type GameState } from '@/types/taskGame';
import {
  DAILY_PLAN_CHANGED_EVENT, DAILY_PLAN_OPEN_EVENT, PLAN_ITEM_MINUTES, PLAN_NOW_PARAM,
  SUGGESTION_GROUPS, SUGGESTION_GROUP_LABEL, closeDayAt, nextSnoozeMinutes, popupMode, questionsFor,
  type PlanSuggestion, type PopupMode, type SuggestionGroup,
} from '@/types/dailyPlan';

/**
 * The planning pop-up — step 2 of the Planner redesign. See
 * src/types/dailyPlan.ts for when it opens and why it is hard to put off.
 *
 * Mounted once in the dashboard layout, for people on the new Planner only
 * (everybody else keeps the old planning card — never both). It draws:
 *
 *  - **the plan**: a suggested 3 from the person's own list and from what is
 *    waiting on them in TTMS, the groups those came from, and a box for
 *    anything else. "Plan these" gives each a time around their meetings;
 *    "Plan my whole day" asks a few questions first. The last step shares the
 *    day's plan with their manager — or not, on their own choice.
 *  - **the bar** across the top of every page while it is snoozed, with the
 *    countdown, and after "Just one thing" until Today's 3 has three.
 *  - **closing the day**, from a quarter hour before the end of their shift:
 *    tick what got done, move the rest, and a short receipt.
 *
 * Everything it saves is an ordinary save through /api/me/tasks — a picked
 * suggestion becomes a task the person can edit or delete like any other —
 * and nothing it reads is anybody else's.
 */

/** Wait this long after a page load before opening, so it does not land on a page still drawing. */
const SHOW_AFTER_MS = 2500;
/** How often to look again while somebody is typing in a form. */
const TYPING_RETRY_MS = 5000;

/** Somebody halfway through typing into a form is not interrupted. */
function typing(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export default function PlanningPopup() {
  const pathname = usePathname();
  const [reply, setReply] = useState<DayPlanReply | null>(null);
  const [mode, setMode] = useState<PopupMode>(null);
  /** Opened on purpose (the bar, the 10:00 link): it can be closed, and offers no snooze. */
  const [onDemand, setOnDemand] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const openTimer = useRef<number | null>(null);

  const clearOpenTimer = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    openTimer.current = null;
  };

  /** Decide from an answer what to show, and when. */
  const evaluate = useCallback((r: DayPlanReply, delay = SHOW_AFTER_MS) => {
    setReply(r);
    clearOpenTimer();
    const want = popupMode(r.state, r.shift, r.picks, officeNowTime(), Date.now());
    if (!want) return;
    const tryOpen = () => {
      if (typing()) { openTimer.current = window.setTimeout(tryOpen, TYPING_RETRY_MS); return; }
      openTimer.current = null;
      setOnDemand(false);
      setMode(want);
    };
    openTimer.current = window.setTimeout(tryOpen, delay);
  }, []);

  const load = useCallback(async () => {
    try { evaluate(await getDayPlan()); } catch { /* a pop-up that cannot load is one nobody misses */ }
  }, [evaluate]);

  // Once per full page load: a settled day is answered from this browser's
  // copy and costs nothing; anything else asks the server.
  useEffect(() => {
    const cached = cachedDayPlan();
    const settled = cached && (cached.state.status === 'off' || !!cached.state.closedAt || !cached.shift
      || cached.state.status === 'planned');
    if (cached && settled) evaluate(cached);
    else void load();
    return clearOpenTimer;
  }, [evaluate, load]);

  // The clock the bar counts down on, and what moves a snooze or a planned
  // day on to its next step without a reload.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const snoozedUntil = reply?.state.status === 'snoozed' ? reply.state.snoozedUntil : null;
  // Once per page: the close-of-day time arriving asks the server again (the
  // day may have been closed in another tab) rather than every second after.
  const closeAsked = useRef(false);
  useEffect(() => {
    if (!reply || mode || openTimer.current) return;
    // A snooze running out opens it again.
    if (snoozedUntil && now >= snoozedUntil) { evaluate(reply, 0); return; }
    if (closeAsked.current || !reply.shift || reply.state.status === 'off' || reply.state.closedAt) return;
    if (officeNowTime(now) >= closeDayAt(reply.shift)) { closeAsked.current = true; void load(); }
  }, [now, reply, mode, snoozedUntil, evaluate, load]);

  // Opened on purpose: the bar's button, or `?plan=1` from the 10:00 line.
  const openNow = useCallback(async () => {
    clearOpenTimer();
    let r = reply;
    if (!r) { try { r = await getDayPlan(); setReply(r); } catch { return; } }
    if (!r.shift) return;
    setOnDemand(true);
    setMode('plan');
  }, [reply]);

  useEffect(() => {
    const onOpen = () => { void openNow(); };
    window.addEventListener(DAILY_PLAN_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(DAILY_PLAN_OPEN_EVENT, onOpen);
  }, [openNow]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get(PLAN_NOW_PARAM) !== '1') return;
    params.delete(PLAN_NOW_PARAM);
    const rest = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
    void openNow();
  }, [pathname, openNow]);

  const finished = (r: DayPlanReply) => {
    setMode(null);
    setReply(r);
    window.dispatchEvent(new Event(DAILY_PLAN_CHANGED_EVENT));
  };

  if (!reply) return null;
  const { state } = reply;

  // The bars, when nothing is open over the page.
  if (!mode) {
    if (state.status === 'snoozed' && snoozedUntil && now < snoozedUntil) {
      const left = Math.max(0, Math.ceil((snoozedUntil - now) / 1000));
      return (
        <TopBar tone="orange">
          <CalendarClock size={16} className="shrink-0" />
          <span className="font-semibold"><Bi>Plan your day · about 1 minute</Bi></span>
          <span className="tabular-nums opacity-90">· back in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>
          <span className="flex-1" />
          <button type="button" onClick={() => void openNow()} data-es
            className="rounded-md bg-[#3b2400] px-3 py-1 text-xs font-bold text-white hover:opacity-90">
            Plan now
          </button>
        </TopBar>
      );
    }
    if (state.status === 'one' && reply.picks < MAX_TODAY_PICKS && reply.shift) {
      return (
        <TopBar tone="amber">
          <ListChecks size={16} className="shrink-0" />
          <span className="font-semibold">{reply.picks || 1} of {MAX_TODAY_PICKS} planned · add the rest on Today</span>
          <span className="flex-1" />
          <button type="button" onClick={() => void openNow()} data-es
            className="rounded-md bg-amber-800 px-3 py-1 text-xs font-bold text-white hover:opacity-90">
            Finish my plan
          </button>
        </TopBar>
      );
    }
    return null;
  }

  if (mode === 'close') {
    return (
      <CloseDay
        today={reply.today}
        onDone={(s) => { if (s) finished({ ...reply, state: s }); else setMode(null); }}
      />
    );
  }

  return (
    <PlanDay
      reply={reply}
      onDemand={onDemand || state.status === 'one'}
      onClose={() => setMode(null)}
      onSnooze={async () => {
        try {
          const s = await answerDayPlan('snooze');
          setReply({ ...reply, state: s });
          setMode(null);
        } catch { setMode(null); }
      }}
      onOff={async () => {
        try { finished({ ...reply, state: await answerDayPlan('off') }); } catch { setMode(null); }
      }}
      onPlanned={(s, picks) => finished({ ...reply, state: s, picks })}
    />
  );
}

function TopBar({ tone, children }: { tone: 'orange' | 'amber'; children: React.ReactNode }) {
  return (
    <div role="status"
      className={`fixed inset-x-0 top-0 z-[45] flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm shadow-md ${
        tone === 'orange' ? 'bg-amber-500 text-[#3b2400]' : 'bg-amber-100 text-amber-900'
      }`}>
      {children}
    </div>
  );
}

// ── Planning the day ─────────────────────────────────────────────────────────

/** One thing that can go in the plan: a task already on the list, a suggestion, or something typed. */
interface Choice {
  key: string;
  title: string;
  why: string;
  task: PersonalTask | null;
  suggestion: PlanSuggestion | null;
  /** Lower comes first in the suggested 3. */
  score: number;
}

type Step = 'pick' | 'think' | 'targets' | 'times' | 'share' | 'done' | 'off';

const GROUP_ICON: Record<SuggestionGroup, typeof Truck> = { queues: Inbox, loads: Truck, clients: Building2, learning: GraduationCap };

function choiceFromTask(t: PersonalTask, today: string): Choice {
  const late = isOverdue(t, today);
  const urgent = t.priority === 'high';
  return {
    key: `t:${t.id}`,
    title: t.title,
    why: late ? 'Late' : urgent ? 'Urgent' : t.time && t.date === today ? `Today at ${formatTime(t.time)}` : 'On your list for today',
    task: t,
    suggestion: null,
    // Late and urgent work comes before most of what TTMS finds; an ordinary
    // task for today sits between a load moving today and the paperwork.
    score: late ? 0.5 : urgent ? 1.5 : 3.5,
  };
}

function choiceFromSuggestion(s: PlanSuggestion): Choice {
  return { key: `s:${s.id}`, title: s.title, why: s.why, task: null, suggestion: s, score: s.rank };
}

function PlanDay({ reply, onDemand, onClose, onSnooze, onOff, onPlanned }: {
  reply: DayPlanReply;
  onDemand: boolean;
  onClose: () => void;
  onSnooze: () => void;
  onOff: () => void;
  onPlanned: (state: DayPlanReply['state'], picks: number) => void;
}) {
  const { profile, can } = useAuth();
  // Broker is derived, never stored: no role set means broker (see isBroker()).
  const roleFlags = {
    isDispatcher: profile?.isDispatcher, isFinance: profile?.isFinance, isHr: profile?.isHr,
    isSalesManager: profile?.isSalesManager, isAdmin: profile?.isAdmin, isIntern: profile?.isIntern,
    broker: can('orders.view'),
  };
  const { formatCalendarDate } = useDateFormatters();
  const today = reply.today;
  const [step, setStep] = useState<Step>('pick');
  const [tasks, setTasks] = useState<PersonalTask[] | null>(null);
  const [suggestions, setSuggestions] = useState<PlanSuggestion[] | null>(null);
  const [day, setDay] = useState<PlanningDay | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [own, setOwn] = useState<Choice[]>([]);
  const [extras, setExtras] = useState<string[]>([]);
  const [full, setFull] = useState(false);
  const [one, setOne] = useState(false);
  const [times, setTimes] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shared, setShared] = useState(false);
  const [touring, setTouring] = useState(false);
  const toured = useRef(false);
  // Today's targets, for people who sell: set in the whole-day plan, saved
  // with it, and for today only — the standing ones are their team lead's.
  const { day: salesDay } = useMySalesDay();
  const [targets, setTargets] = useState<SalesTargets | null>(null);
  useEffect(() => { if (salesDay && !targets) setTargets(salesDay.targets); }, [salesDay, targets]);

  // Everything it needs, read once when it opens.
  useEffect(() => {
    let live = true;
    listMyTasks().then((d) => {
      if (!live) return;
      setTasks(d.tasks);
      // Anything already in Today's 3 starts picked.
      setPicked(picksIn(d.tasks, d.todayPicks, today).filter((t) => t.status !== 'done').map((t) => `t:${t.id}`));
    }).catch(() => { if (live) setTasks([]); });
    getPlanSuggestions().then((s) => { if (live) setSuggestions(s); }).catch(() => { if (live) setSuggestions([]); });
    getMyPlanningDay(today).then((d) => { if (live) setDay(d); }).catch(() => { /* times fall back to none */ });
    return () => { live = false; };
  }, [today]);

  // The tour, the first time the pick step is on screen with something on it.
  useEffect(() => {
    if (step !== 'pick' || toured.current || !profile || !tasks || !suggestions) return;
    toured.current = true;
    if (!tourSeen(profile.preferences?.toursSeen, 'popup')) setTouring(true);
  }, [step, profile, tasks, suggestions]);

  const mine = useMemo(() => (tasks ? tasksForToday(tasks, today).filter(canPickForToday).map((t) => choiceFromTask(t, today)) : []), [tasks, today]);

  // A suggestion for a load already on one of their open tasks is on their list already.
  const found = useMemo(() => {
    if (!suggestions) return [];
    const onList = new Set((tasks ?? []).filter((t) => t.status !== 'done' && !t.archived).flatMap((t) => t.orders.map((o) => o.id)));
    return suggestions.filter((s) => !s.order || !onList.has(s.order.id)).map(choiceFromSuggestion);
  }, [suggestions, tasks]);

  const all = useMemo(() => {
    const map = new Map<string, Choice>();
    for (const c of [...mine, ...found, ...own]) map.set(c.key, c);
    // A pick from Today's 3 that is not due today still has to be drawn.
    for (const t of tasks ?? []) if (picked.includes(`t:${t.id}`) && !map.has(`t:${t.id}`)) map.set(`t:${t.id}`, choiceFromTask(t, today));
    return map;
  }, [mine, found, own, tasks, picked, today]);

  const suggested = useMemo(
    () => [...mine, ...found].sort((a, b) => a.score - b.score).slice(0, MAX_TODAY_PICKS),
    [mine, found],
  );

  const toggle = (key: string) => setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : p.length < MAX_TODAY_PICKS ? [...p, key] : p));

  const addOwn = (title: string) => {
    const t = title.trim().slice(0, MAX_TASK_TITLE);
    if (!t) return;
    const key = `o:${own.length + 1}:${t}`;
    setOwn((o) => [...o, { key, title: t, why: 'Added by you', task: null, suggestion: null, score: 9 }]);
    setPicked((p) => (p.length < MAX_TODAY_PICKS ? [...p, key] : p));
  };

  /** Times for the picks: one already timed today keeps it; the rest go in the next free half hours. */
  const placeTimes = (keys: string[]) => {
    const next: Record<string, string | null> = {};
    const items: DayItem[] = [...(day?.items ?? [])];
    const nowTime = officeNowTime();
    for (const key of keys) {
      const c = all.get(key);
      if (c?.task?.time && c.task.date === today) { next[key] = c.task.time; continue; }
      const free = day ? freeStarts({ ...day, items }, PLAN_ITEM_MINUTES, nowTime)[0] ?? null : null;
      next[key] = free;
      if (free) items.push({ id: key, title: c?.title ?? '', kind: 'task', time: free, endTime: addMinutes(free, PLAN_ITEM_MINUTES), series: false, planning: false });
    }
    setTimes(next);
  };

  const goTimes = (keys = picked) => { placeTimes(keys); setStep('times'); };

  /** Save the plan: tasks made or moved to today with their times, Today's 3, then the day's answer. */
  const save = async (share: boolean) => {
    setBusy(true);
    setError('');
    try {
      const ids: string[] = [];
      for (const key of picked) {
        const c = all.get(key);
        if (!c) continue;
        const time = times[key] ?? null;
        const slot = { time, endTime: time ? addMinutes(time, PLAN_ITEM_MINUTES) : null };
        if (c.task) {
          const t = c.task;
          const keepTime = t.time && t.date === today && t.time === time;
          const patch = {
            ...(t.date !== today ? { date: today } : {}),
            ...(!keepTime ? slot : {}),
          };
          if (Object.keys(patch).length) {
            // A repeating task's copy moved for today only — its pattern stays.
            await updateMyTask(t.id, patch, t.repeat !== 'none' ? 'this' : undefined);
          }
          ids.push(t.id);
        } else {
          const made = await createMyTask({
            kind: 'task', title: c.title, date: today, ...slot,
            ...(c.suggestion?.order ? { orders: [c.suggestion.order] } : {}),
          });
          ids.push(made.task.id);
        }
      }
      for (const title of extras) await createMyTask({ kind: 'task', title, date: today });
      if (full && salesDay && targets && JSON.stringify(targets) !== JSON.stringify(salesDay.targets)) {
        await setTodayTargets(targets);
      }
      await saveMyTodayPicks({ date: today, ids });
      if (share) await shareDayPlan(today);
      const answer = await answerDayPlanWithGame(one ? 'one' : 'planned', { full });
      const s = answer.state;
      // What planning paid today, for the done step (game mode only).
      setPlanGame(answer.game?.enabled ? answer.game : null);
      setShared(share);
      setStep('done');
      // Told once "Back to work" is pressed, so the page underneath does not reload behind the card.
      doneState.current = { state: s, picks: ids.length };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your plan.');
    } finally {
      setBusy(false);
    }
  };
  const doneState = useRef<{ state: DayPlanReply['state']; picks: number } | null>(null);
  const [planGame, setPlanGame] = useState<GameState | null>(null);

  const snoozeLeft = nextSnoozeMinutes(reply.state.snoozes);
  const name = profile?.firstName || profile?.displayName?.split(' ')[0] || '';
  const hour = Number(officeNowTime().slice(0, 2));
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const loading = tasks === null || suggestions === null;
  // The whole-day plan has a targets step only for people who sell.
  const withTargets = full && !!salesDay;
  const dots = full ? (withTargets ? 5 : 4) : 3;
  const at = {
    pick: 0, think: 1, targets: 2,
    times: full ? (withTargets ? 3 : 2) : 1,
    share: full ? (withTargets ? 4 : 3) : 2,
    done: dots, off: 0,
  }[step];
  const questions = questionsFor(roleFlags);
  const head = (title: React.ReactNode, sub: React.ReactNode) => (
    <div className="shrink-0 bg-gradient-to-br from-brand-900 to-brand-700 px-5 pb-3 pt-4 text-white">
      <div className="flex items-start gap-2">
        <p className="flex-1 text-[11px] font-bold uppercase tracking-wider text-amber-300">
          {formatCalendarDate(today)} · <span data-es>Plan your day</span>
        </p>
        {onDemand && step !== 'done' && (
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 rounded p-1 text-white/70 hover:bg-white/10 hover:text-white">
            <X size={18} />
          </button>
        )}
      </div>
      <h2 id="plan-popup-title" className="mt-0.5 text-2xl font-bold leading-tight">{title}</h2>
      {sub && <p className="mt-0.5 text-sm text-brand-100">{typeof sub === 'string' ? <Bi>{sub}</Bi> : sub}</p>}
      {step !== 'done' && step !== 'off' && (
        <div className="mt-3 flex gap-1.5">
          {Array.from({ length: dots }, (_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= at ? 'bg-amber-300' : 'bg-white/20'}`} />)}
        </div>
      )}
    </div>
  );

  let body: React.ReactNode;
  let foot: React.ReactNode = null;

  if (step === 'pick') {
    const groups = SUGGESTION_GROUPS
      .map((g) => ({ g, items: found.filter((c) => c.suggestion?.group === g) }))
      .filter((x) => x.items.length);
    body = loading ? <Spinner /> : (
      <>
        {suggested.length > 0 && (
          <div data-tour="popup-suggested" className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-800"><Sparkles size={12} className="mr-1 inline" />Suggested {suggested.length}</p>
              <button type="button" onClick={() => { const keys = suggested.map((c) => c.key); setPicked(keys); setFull(false); goTimes(keys); }}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-700">
                Use these {suggested.length}
              </button>
            </div>
            <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm font-semibold text-gray-900">
              {suggested.map((c) => <li key={c.key}>{c.title}</li>)}
            </ol>
          </div>
        )}
        {mine.length > 0 && <Group label="On your list" Icon={ListChecks} items={mine} picked={picked} onToggle={toggle} />}
        {groups.map(({ g, items }) => (
          <Group key={g} label={SUGGESTION_GROUP_LABEL[g]} Icon={GROUP_ICON[g]} items={items} picked={picked} onToggle={toggle} />
        ))}
        {own.length > 0 && <Group label="Your own" Icon={Plus} items={own} picked={picked} onToggle={toggle} />}
        {mine.length === 0 && found.length === 0 && (
          <p className="mt-1 rounded-lg bg-gray-50 px-3 py-3 text-sm text-gray-600">
            <Bi>Nothing is due today on your list, and TTMS found nothing waiting on you. What are the three things that matter most today?</Bi>
          </p>
        )}
        <p className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wider text-gray-400" data-es>Something else?</p>
        <AddBox placeholder="Type it and press Add" onAdd={(t) => { setError(''); addOwn(t); }} disabled={picked.length >= MAX_TODAY_PICKS} />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </>
    );
    foot = (
      <>
        <div data-tour="popup-snooze" className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {!onDemand && snoozeLeft !== null && (
            <button type="button" onClick={onSnooze} className="text-sm font-medium text-gray-600 underline hover:text-gray-900">
              Remind me in {snoozeLeft} min
            </button>
          )}
          {!onDemand && snoozeLeft === null && (
            <>
              <span className="basis-full text-xs font-semibold text-red-600"><Bi>You’ve put this off twice. Plan just one thing to get back to work.</Bi></span>
              <button type="button" disabled={loading}
                onClick={() => {
                  const key = picked[0] ?? suggested[0]?.key;
                  if (!key) { setError('Type one thing you will do today, then press Add.'); return; }
                  setPicked([key]); setOne(true); setFull(false);
                  placeTimes([key]); setStep('share');
                }}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-bold text-[#3b2400] hover:bg-amber-400 disabled:opacity-50">
                Just one thing · 30 sec
              </button>
            </>
          )}
          {!onDemand && (
            <button type="button" onClick={() => setStep('off')} className="text-sm text-gray-400 hover:text-gray-700">
              I&rsquo;m off today
            </button>
          )}
        </div>
        <span className="flex-1" />
        <button type="button" data-tour="popup-full" disabled={!picked.length}
          onClick={() => { setFull(true); setOne(false); setStep('think'); }}
          className="rounded-lg border-2 border-brand-600 px-3 py-1.5 text-sm font-bold text-brand-700 hover:bg-brand-50 disabled:opacity-40">
          Plan my whole day
        </button>
        <button type="button" disabled={!picked.length} onClick={() => { setFull(false); setOne(false); goTimes(); }}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-40">
          {picked.length ? `Plan these ${picked.length}` : 'Pick at least one'}
        </button>
      </>
    );
  } else if (step === 'think') {
    body = (
      <>
        {questions.map((q) => {
          const offered = found.filter((c) => c.suggestion && q.kinds.includes(c.suggestion.kind) && !picked.includes(c.key)).slice(0, 3);
          return (
            <div key={q.id} className="mb-4">
              <p className="text-sm font-semibold text-gray-900">{q.ask}</p>
              <p className="text-xs text-gray-500">{q.hint}</p>
              <p className="text-xs italic text-teal-700" lang="es">{q.es.ask}</p>
              {offered.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {offered.map((c) => {
                    const on = extras.includes(c.title);
                    return (
                      <button key={c.key} type="button"
                        onClick={() => setExtras((x) => (on ? x.filter((v) => v !== c.title) : [...x, c.title]))}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${on ? 'border-green-600 bg-green-50 text-green-700' : 'border-dashed border-gray-400 text-gray-600 hover:border-brand-500'}`}>
                        {on ? <Check size={11} className="mr-0.5 inline" /> : '+ '}{c.title}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        <AddBox placeholder="Anything else on your mind?" onAdd={(t) => setExtras((x) => (x.includes(t) ? x : [...x, t.slice(0, MAX_TASK_TITLE)]))} />
        {extras.length > 0 && (
          <ul className="mt-2 space-y-1">
            {extras.map((x) => (
              <li key={x} className="flex items-center gap-2 text-sm text-gray-700">
                <Check size={13} className="text-green-600" /> <span className="flex-1 truncate">{x}</span>
                <button type="button" aria-label="Take it out" onClick={() => setExtras((v) => v.filter((y) => y !== x))} className="text-gray-300 hover:text-gray-600"><X size={14} /></button>
              </li>
            ))}
          </ul>
        )}
      </>
    );
    foot = (
      <>
        <BackButton onClick={() => setStep('pick')} />
        <span className="flex-1" />
        <button type="button" onClick={() => (withTargets ? setStep('targets') : goTimes())}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-700">
          {withTargets ? 'Next: today’s targets' : 'Next: block my time'}
        </button>
      </>
    );
  } else if (step === 'targets' && salesDay && targets) {
    body = (
      <>
        <TargetSteppers day={salesDay} value={targets} onChange={setTargets} />
        <p className="mt-3 text-xs text-gray-500">
          <Bi>For today only. Your Sales Manager sets the usual numbers; they and admins see how the day goes.</Bi>
        </p>
      </>
    );
    foot = (
      <>
        <BackButton onClick={() => setStep('think')} />
        <span className="flex-1" />
        <button type="button" onClick={() => goTimes()} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-700">
          Next: block my time
        </button>
      </>
    );
  } else if (step === 'times') {
    const options = day?.shift ? shiftQuarterHours(day.shift) : [];
    const events = (day?.items ?? []).filter((i) => i.kind === 'event');
    body = (
      <>
        {!day?.shift && <p className="mb-2 text-sm text-gray-500"><Bi>No working hours are set for today, so pick times yourself or leave them without one.</Bi></p>}
        <ul className="space-y-1.5">
          {events.map((e) => (
            <li key={e.id} className="grid grid-cols-[7.5rem_1fr] items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
              <span className="tabular-nums text-xs">{formatTime(e.time)}{e.endTime ? ` – ${formatTime(e.endTime)}` : ''}</span>
              <span className="truncate">{e.title}</span>
            </li>
          ))}
          {picked.map((key) => {
            const c = all.get(key);
            const time = times[key] ?? null;
            return (
              <li key={key} className="grid grid-cols-[7.5rem_1fr] items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                <select value={time ?? ''} aria-label={`When for ${c?.title ?? ''}`}
                  onChange={(e) => setTimes((t) => ({ ...t, [key]: e.target.value || null }))}
                  className="rounded border border-amber-300 bg-white px-1.5 py-0.5 text-xs font-medium text-gray-800">
                  <option value="">No set time</option>
                  {[...new Set([...(time ? [time] : []), ...options])].sort().map((o) => <option key={o} value={o}>{formatTime(o)}</option>)}
                </select>
                <span className="truncate">{c?.title}</span>
              </li>
            );
          })}
        </ul>
        {extras.length > 0 && (
          <>
            <p className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-wider text-gray-400" data-es>Also today, between blocks</p>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-gray-700">{extras.map((x) => <li key={x}>{x}</li>)}</ul>
          </>
        )}
        <p className="mt-3 text-xs text-gray-500"><Bi>Each of your 3 gets half an hour in the free time between your meetings. Drag them on the Calendar later if the day changes.</Bi></p>
      </>
    );
    foot = (
      <>
        <BackButton onClick={() => setStep(full ? (withTargets ? 'targets' : 'think') : 'pick')} />
        <span className="flex-1" />
        <button type="button" onClick={() => setStep('share')} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-700">
          Looks good
        </button>
      </>
    );
  } else if (step === 'share') {
    // Exactly what publishDayPlan() copies: everything dated today and every
    // event that falls on it — not only the 3 — so the preview says so.
    const preview = [
      ...picked.map((key) => ({ id: key, title: all.get(key)?.title ?? '', time: times[key] ?? null })),
      ...extras.map((x) => ({ id: `x:${x}`, title: x, time: null as string | null })),
      ...(tasks ?? [])
        .filter((t) => !t.archived && !picked.includes(`t:${t.id}`) && t.inviteResponse !== 'declined'
          && (t.kind === 'event' ? occursOn(t, today) : t.date === today))
        .map((t) => ({ id: t.id, title: t.title, time: t.time })),
    ].sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'));
    body = (
      <>
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <div className="flex flex-wrap justify-between gap-2 bg-brand-50 px-3 py-2 text-sm font-bold text-brand-800">
            <span>{name ? `${name}’s plan` : 'Your plan'}</span><span>{formatCalendarDate(today)}</span>
          </div>
          <ul>
            {preview.map((p) => (
              <li key={p.id} className="flex gap-3 border-t border-gray-100 px-3 py-2 text-sm">
                <span className="w-20 shrink-0 tabular-nums text-gray-500">{p.time ? formatTime(p.time) : '—'}</span>
                <span className="min-w-0 flex-1 truncate text-gray-800">{p.title}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          <Bi>Your manager (and admins) see the names and times above — everything on your day, not only your 3. Notes, steps, contacts and whether you finish them stay private. Mark anything personal as Busy on the Calendar.</Bi>
        </p>
        {withTargets && targets && (
          <p className="mt-2 text-xs text-gray-600">
            <span className="font-semibold">Targets:</span>{' '}
            {targets.calls} calls · {targets.emails} emails · {targets.leads} new clients · {targets.quotes} quotes · {targets.referrals} referrals
          </p>
        )}
        {one && <p className="mt-2 text-xs font-semibold text-amber-800"><Bi>One is enough to get back to work. A bar stays at the top until you add the other two on Today.</Bi></p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </>
    );
    foot = (
      <>
        {!one && <BackButton onClick={() => setStep('times')} />}
        <span className="flex-1" />
        <button type="button" disabled={busy} onClick={() => void save(false)} className="text-sm font-medium text-gray-500 underline hover:text-gray-800 disabled:opacity-50">
          Keep it to myself
        </button>
        <button type="button" disabled={busy} onClick={() => void save(true)}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50">
          {busy ? 'Saving…' : 'Share my plan'}
        </button>
      </>
    );
  } else if (step === 'done') {
    body = (
      <div className="py-2 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-600 text-white"><Check size={32} strokeWidth={3} /></div>
        <h3 className="mt-3 text-2xl font-bold text-gray-900">{one ? 'Good start' : full ? 'Whole day planned' : 'Day planned'}</h3>
        <p className="mt-1 text-sm text-gray-600">
          {shared ? <Bi>Your manager can see it now.</Bi> : <Bi>Kept to yourself. You can share it later from the Calendar.</Bi>}
        </p>
        <p className="mt-1 text-sm text-gray-600">
          Your {one ? 'one thing is' : `${picked.length} are`} on <Link href="/dashboard/planner" className="font-medium text-brand-700 hover:underline">Today</Link>.
        </p>
        {planGame && (
          <p className="mx-auto mt-3 inline-flex rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800">
            Planning today: +{planGame.day?.planXp ?? 0} XP · Level {levelFor(planGame.xp).level}
          </p>
        )}
      </div>
    );
    foot = (
      <>
        <span className="flex-1" />
        <button type="button" autoFocus
          onClick={() => { const d = doneState.current; if (d) onPlanned(d.state, d.picks); else onClose(); }}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700">
          Back to work
        </button>
      </>
    );
  } else {
    body = (
      <div className="py-2 text-center">
        <Coffee size={32} className="mx-auto text-gray-400" />
        <h3 className="mt-2 text-xl font-bold text-gray-900"><Bi>Off today?</Bi></h3>
        <p className="mt-1 text-sm text-gray-600">
          <Bi>No time off is on record for you today, so TTMS will ask again tomorrow. If you are working, planning takes about a minute.</Bi>
        </p>
      </div>
    );
    foot = (
      <>
        <button type="button" onClick={onOff} className="text-sm font-medium text-gray-600 underline hover:text-gray-900">Close for today</button>
        <span className="flex-1" />
        <button type="button" onClick={() => setStep('pick')} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-700">
          Plan now
        </button>
      </>
    );
  }

  const titles: Record<Step, [React.ReactNode, React.ReactNode]> = {
    pick: [`${hello}${name ? `, ${name}` : ''}. Here’s a plan.`, found.length ? 'Your list, plus what TTMS found waiting on you today.' : 'Pick the three things that matter most today.'],
    think: ['Think it through', 'A few questions to catch what isn’t on your list. Tap anything to add it to today.'],
    targets: ['Today’s targets', 'Starting points from your team lead. Change them for today if you need to.'],
    times: ['When will you do them?', 'Fitted into the free time between your meetings. Change any of them.'],
    share: ['Share it with your manager', 'This is what they will see.'],
    done: ['Planned', ''],
    off: ['Not working today?', ''],
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,12,28,.58)] p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="plan-popup-title">
      <div className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {head(titles[step][0], titles[step][1])}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{body}</div>
        {foot && <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">{foot}</div>}
      </div>
      {touring && (
        <PlannerTour steps={POPUP_TOUR} label="Planning" onClose={(how) => {
          setTouring(false);
          // Not the "Take the Planner tour" step on My journey: that is the Today tab's.
          if (how !== 'nothing') void recordTour('popup', false);
        }} />
      )}
    </div>
  );
}

function Group({ label, Icon, items, picked, onToggle }: {
  label: string; Icon: typeof Truck; items: Choice[]; picked: string[]; onToggle: (key: string) => void;
}) {
  return (
    <>
      <p className="mb-1.5 mt-4 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-gray-400" data-es>
        <Icon size={12} /> {label}
      </p>
      <ul className="space-y-1.5">
        {items.map((c) => {
          const n = picked.indexOf(c.key) + 1;
          const on = n > 0;
          return (
            <li key={c.key}>
              <button type="button" onClick={() => onToggle(c.key)} disabled={!on && picked.length >= MAX_TODAY_PICKS}
                className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left disabled:opacity-40 ${
                  on ? 'border-brand-600 bg-brand-50' : 'border-gray-200 bg-white hover:border-brand-400'
                }`}>
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-[11px] font-bold ${
                  on ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-400'
                }`}>{on ? n : ''}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-gray-900">{c.title}</span>
                  <span className="block text-xs text-gray-500">{c.why}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function AddBox({ placeholder, onAdd, disabled }: { placeholder: string; onAdd: (t: string) => void; disabled?: boolean }) {
  const [v, setV] = useState('');
  return (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onAdd(v.trim()); setV(''); } }}>
      <input value={v} onChange={(e) => setV(e.target.value)} maxLength={MAX_TASK_TITLE} placeholder={placeholder} aria-label={placeholder}
        disabled={disabled}
        className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50" />
      <button type="submit" disabled={disabled || !v.trim()} className="rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
        Add
      </button>
    </form>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} data-es className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-800">
      <ArrowLeft size={14} /> Back
    </button>
  );
}

function Spinner() {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-sm text-gray-500">
      <div className="h-7 w-7 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      <span data-es>Looking through your list and your loads…</span>
    </div>
  );
}

// ── Closing the day ──────────────────────────────────────────────────────────

/**
 * The same pop-up at the end of the shift: Today's 3 and everything else for
 * today, each one tap from done or from tomorrow, then a receipt. Ticking is
 * an ordinary save, so game mode, streaks and repeats all behave as they do
 * anywhere else.
 *
 * "Close my day" records the close before the receipt is drawn (step 7), so
 * the receipt can show what game mode paid for the day; "Done" only puts the
 * card away. A day with nothing to look back on is recorded as skipped: it
 * closes quietly and earns nothing.
 */
function CloseDay({ today, onDone }: { today: string; onDone: (state: DayPlanReply['state'] | null) => void }) {
  const { formatCalendarDate } = useDateFormatters();
  // The answer goes once: the page above re-renders every second for the
  // bar's clock, and a fresh onDone each time must not mean a fresh save.
  const answered = useRef<Promise<DayPlanReply['state'] | null> | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const record = useCallback((skipped: boolean) => {
    if (!answered.current) {
      answered.current = answerDayPlanWithGame(skipped ? 'closeSkipped' : 'closed')
        .then((r) => { setGame(r.game); return r.state; })
        .catch(() => null);
    }
    return answered.current;
  }, []);
  const finish = useCallback(async (skipped: boolean) => { onDone(await record(skipped)); }, [onDone, record]);
  const [tasks, setTasks] = useState<PersonalTask[] | null>(null);
  const [pickIds, setPickIds] = useState<string[]>([]);
  const [moved, setMoved] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(false);
  const tomorrow = nextWorkingDay(today);
  const friday = new Date(`${today}T00:00:00Z`).getUTCDay() === 5;

  useEffect(() => {
    let live = true;
    listMyTasks().then((d) => {
      if (!live) return;
      setTasks(d.tasks);
      setPickIds(picksIn(d.tasks, d.todayPicks, today).map((t) => t.id));
    }).catch(() => { if (live) setTasks([]); });
    return () => { live = false; };
  }, [today]);

  const rows = useMemo(() => {
    if (!tasks) return [];
    const picks = pickIds.map((id) => tasks.find((t) => t.id === id)).filter((t): t is PersonalTask => !!t);
    const rest = tasksForToday(tasks, today).filter((t) => !pickIds.includes(t.id));
    return [...picks, ...rest];
  }, [tasks, pickIds, today]);

  // Nothing to look back on: close quietly rather than show an empty card.
  useEffect(() => {
    if (tasks && rows.length === 0 && moved.size === 0) void finish(true);
  }, [tasks, rows.length, moved.size, finish]);

  const replace = (t: PersonalTask) => setTasks((list) => (list ?? []).map((x) => (x.id === t.id ? t : x)));

  const tick = async (t: PersonalTask) => {
    setBusy(t.id); setError('');
    try { replace((await updateMyTask(t.id, { status: t.status === 'done' ? 'todo' : 'done' })).task); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save that.'); }
    finally { setBusy(null); }
  };

  const moveOn = async (t: PersonalTask) => {
    setBusy(t.id); setError('');
    try {
      replace((await updateMyTask(t.id, { date: tomorrow }, t.repeat !== 'none' ? 'this' : undefined)).task);
      setMoved((m) => new Set(m).add(t.id));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not move that.'); }
    finally { setBusy(null); }
  };

  const done = rows.filter((t) => t.status === 'done').length;
  const open = rows.filter((t) => t.status !== 'done' && !moved.has(t.id)).length;
  const picksDone = rows.filter((t) => pickIds.includes(t.id) && t.status === 'done').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,12,28,.58)] p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="close-day-title">
      <div className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="shrink-0 bg-gradient-to-br from-brand-900 to-brand-700 px-5 pb-4 pt-4 text-white">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300" data-es>Close the day</p>
          <h2 id="close-day-title" className="mt-0.5 text-2xl font-bold leading-tight">{receipt ? 'Day closed' : 'How did today go?'}</h2>
          <p className="mt-0.5 text-sm text-brand-100">
            {receipt ? 'See you tomorrow.' : 'Tick what got done and move the rest, so tomorrow starts clean.'}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!tasks ? <Spinner /> : receipt ? (
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <div className="flex justify-between bg-brand-800 px-4 py-3 text-white"><b className="text-lg" data-es>Today</b><span className="text-sm opacity-80">{formatCalendarDate(today)}</span></div>
              <Receipt label="Today’s 3 done" value={`${picksDone} of ${pickIds.length}`} />
              <Receipt label="Done today" value={String(done)} />
              <Receipt label="Moved to tomorrow" value={String(moved.size)} />
              <Receipt label="Still open" value={String(open)} />
              {/* Game mode's line on the receipt: what today paid, the level, the streak. */}
              {game?.enabled && (
                <>
                  <Receipt label="XP today" value={`${dayOf(game, today).xp >= 0 ? '+' : ''}${dayOf(game, today).xp.toLocaleString('en-US')}`} />
                  <Receipt label="Level" value={`${levelFor(game.xp).level} · ${levelTitle(levelFor(game.xp).level, game.theme)}`} />
                  <Receipt label="Streak" value={`${game.streak} ${game.streak === 1 ? 'day' : 'days'}`} />
                </>
              )}
            </div>
          ) : (
            <>
              <ul className="space-y-1.5">
                {rows.map((t) => {
                  const isDone = t.status === 'done';
                  const wasMoved = moved.has(t.id);
                  return (
                    <li key={t.id} className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${isDone ? 'border-transparent bg-green-50' : 'border-gray-200'}`}>
                      <button type="button" disabled={busy === t.id || wasMoved} onClick={() => void tick(t)} aria-label={isDone ? 'Mark not done' : 'Mark done'}
                        className={isDone ? 'text-green-600' : 'text-gray-400 hover:text-green-600'}>
                        {isDone ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                      </button>
                      <span className={`min-w-0 flex-1 truncate text-sm font-medium ${isDone ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                        {pickIds.includes(t.id) && <Sun size={12} className="mr-1 inline text-amber-500" />}{t.title}
                      </span>
                      {wasMoved ? (
                        <span className="text-xs font-semibold text-brand-700">{friday ? 'Moved to Monday' : 'Moved to tomorrow'}</span>
                      ) : !isDone && (
                        <button type="button" disabled={busy === t.id} onClick={() => void moveOn(t)}
                          className="rounded-full border border-gray-300 px-2.5 py-0.5 text-xs font-medium text-gray-600 hover:border-brand-500 hover:text-brand-700">
                          {friday ? 'Monday' : 'Tomorrow'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              {/* Today's numbers, to fix a miscount before the day closes. Sellers only. */}
              <SalesTargetsCard compact />
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">
          {receipt ? (
            <>
              {friday && (
                <button type="button" onClick={() => { finish(false); window.dispatchEvent(new CustomEvent(PLANNING_ASK_EVENT, { detail: 'weekly' })); }}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
                  <Clock size={14} /> Plan next week
                </button>
              )}
              <span className="flex-1" />
              <button type="button" autoFocus onClick={() => finish(false)} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700">
                Done
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => finish(true)} className="text-sm font-medium text-gray-500 underline hover:text-gray-800">Not today</button>
              <span className="flex-1" />
              <button type="button" disabled={!tasks} onClick={async () => { await record(false); setReceipt(true); }}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-40">
                Close my day
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Receipt({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-t border-dashed border-gray-200 px-4 py-2 text-sm">
      <span className="text-gray-700" data-es>{label}</span><b className="tabular-nums text-gray-900">{value}</b>
    </div>
  );
}
