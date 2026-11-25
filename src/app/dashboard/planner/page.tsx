'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, HelpCircle, ListTodo, Lock, Sun, Undo2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { PersonalTasksProvider } from '@/lib/personalTasks';
import { choosePlanner, recordTour, tourSeen, usePlanner } from '@/lib/planner';
import TodayTab from '@/components/planner/TodayTab';
import TasksTab from '@/components/planner/TasksTab';
import CalendarScreen from '@/components/calendar/CalendarScreen';
import PlannerTour, { CALENDAR_TOUR, TASKS_TOUR, TODAY_TOUR, type TourStep } from '@/components/planner/PlannerTour';
import { BackToOldDialog } from '@/components/planner/PlannerSwitch';
import { Bi } from '@/components/spanish/Es';
import { DAILY_PLAN_OPEN_EVENT, PLAN_NOW_PARAM } from '@/types/dailyPlan';

/**
 * The Planner: My tasks and the Calendar as one page, with Today in front.
 * See src/types/planner.ts for the rollout and the redesign it is step 1 of.
 *
 * `?tab=today|tasks|calendar`. The Tasks and Calendar tabs are today's two
 * screens as they are; later steps of the redesign rebuild them. All three
 * share one copy of the list (PersonalTasksProvider), so moving between tabs
 * reads nothing again and a task added on one is on the others at once. Only
 * the open tab is mounted, so a game notice is shown once, not per tab.
 *
 * Open to everybody, like the two pages it joins, and reading only the
 * caller's own list. Who has it is a matter of which pages are drawn, not of
 * access: somebody it has not reached yet is told so and pointed back.
 */

type Tab = 'today' | 'tasks' | 'calendar';

const TABS: { id: Tab; label: string; Icon: typeof Sun }[] = [
  { id: 'today',    label: 'Today',    Icon: Sun },
  { id: 'tasks',    label: 'Tasks',    Icon: ListTodo },
  { id: 'calendar', label: 'Calendar', Icon: CalendarDays },
];

const isTab = (v: string | null): v is Tab => v === 'today' || v === 'tasks' || v === 'calendar';

/** Tabs that have a tour so far. The rest get theirs with their redesign. */
const TOURS: Partial<Record<Tab, { id: 'today' | 'tasks' | 'calendar'; steps: TourStep[]; label: string }>> = {
  today: { id: 'today', steps: TODAY_TOUR, label: 'Today' },
  tasks: { id: 'tasks', steps: TASKS_TOUR, label: 'Tasks' },
  calendar: { id: 'calendar', steps: CALENDAR_TOUR, label: 'Calendar' },
};

function Planner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { profile } = useAuth();
  const { state, loaded } = usePlanner();
  const tab: Tab = isTab(params.get('tab')) ? (params.get('tab') as Tab) : 'today';
  const [goingBack, setGoingBack] = useState(false);
  const [touring, setTouring] = useState(false);
  const [trying, setTrying] = useState(false);

  const tour = TOURS[tab];
  // The first visit to a tab with a tour starts it, once the account's record
  // of tours is in — never before, or it would start again on every computer.
  // Once per visit: the profile refreshes live, and the saved "seen" can
  // arrive a moment after the tour is closed.
  const autoStarted = useRef(new Set<string>());
  useEffect(() => {
    if (!state.on || !tour || !profile || autoStarted.current.has(tour.id)) return;
    if (!tourSeen(profile.preferences?.toursSeen, tour.id)) {
      autoStarted.current.add(tour.id);
      setTouring(true);
    }
  }, [state.on, tour, profile]);

  // The 10:00 line's link is `/dashboard/planner?plan=1`. From another page
  // the pop-up sees the address change by itself; already on this page the
  // path does not change, so the page tells it.
  const planNow = params.get(PLAN_NOW_PARAM) === '1';
  useEffect(() => {
    if (planNow) window.dispatchEvent(new Event(DAILY_PLAN_OPEN_EVENT));
  }, [planNow]);

  const choose = (t: Tab) => router.replace(`${pathname}?tab=${t}`, { scroll: false });

  if (!loaded) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (!state.on) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900"><Bi>Planner</Bi></h1>
        {state.canSwitch ? (
          <>
            <p className="mt-2 text-sm text-gray-600">
              Your day, tasks and calendar in one place. Same tasks as My tasks — you can go back any time.
            </p>
            <button type="button" disabled={trying}
              onClick={async () => { setTrying(true); try { await choosePlanner('new'); } finally { setTrying(false); } }}
              className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              Try the new Planner
            </button>
          </>
        ) : (
          <p className="mt-2 text-sm text-gray-600">
            The new Planner isn&rsquo;t switched on for you yet. Your tasks are on{' '}
            <Link href="/dashboard/tasks" className="text-brand-700 hover:underline">My tasks</Link> and the{' '}
            <Link href="/dashboard/calendar" className="text-brand-700 hover:underline">Calendar</Link>.
          </p>
        )}
      </div>
    );
  }

  return (
    <PersonalTasksProvider>
      <div className="min-h-full">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900"><Bi>Planner</Bi></h1>
            <p className="flex items-center gap-1 text-sm text-gray-500"><Lock size={12} /> <span><Bi>Only you can see your list.</Bi></span></p>
          </div>
          <nav className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5" aria-label="Planner tabs">
            {TABS.map(({ id, label, Icon }) => (
              <button key={id} type="button" aria-pressed={tab === id} onClick={() => choose(id)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
                  tab === id ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </nav>
          <span className="flex-1" />
          {tour && (
            <button type="button" onClick={() => setTouring(true)} title="Show me around this tab"
              aria-label="Show me around this tab"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-brand-500 text-brand-700 hover:bg-brand-50">
              <HelpCircle size={16} />
            </button>
          )}
          {state.canSwitch && (
            <button type="button" onClick={() => setGoingBack(true)}
              className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
              <Undo2 size={14} /> Back to the old pages
            </button>
          )}
        </div>

        {tab === 'today' && <TodayTab />}
        {/* The new Tasks tab (step 5). The old My tasks page keeps MyTasksScreen. */}
        {tab === 'tasks' && <TasksTab />}
        {tab === 'calendar' && <CalendarScreen embedded />}
      </div>

      {touring && tour && (
        <PlannerTour
          steps={tour.steps}
          label={tour.label}
          onClose={(how) => {
            setTouring(false);
            // A tour nobody saw is not recorded, so it is offered again next visit.
            if (how !== 'nothing') void recordTour(tour.id, how === 'finished');
          }}
        />
      )}
      {goingBack && <BackToOldDialog tab={tab} onClose={() => setGoingBack(false)} />}
    </PersonalTasksProvider>
  );
}

export default function PlannerPage() {
  // useSearchParams() suspends on the server render; the boundary is required.
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" /></div>}>
      <Planner />
    </Suspense>
  );
}
