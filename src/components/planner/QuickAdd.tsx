'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Clock, CornerDownLeft, Flag, Hash, Plus, User } from 'lucide-react';
import { loadOrderCard } from '@/lib/orderCards';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { formatTime, type PersonalTask, type PersonalTaskInput, type TaskContact, type TaskOrder } from '@/types/task';
import { parseQuickAdd } from '@/types/quickAdd';
import type { DirectoryPerson } from '@/lib/directory';

/*
 * The Planner's one add box, shared by the Today and Tasks tabs (moved out of
 * TodayTab.tsx with step 5, 2026-11-25). One line of plain words, read by
 * parseQuickAdd(), with chips showing what was understood before anything is
 * saved — see src/types/quickAdd.ts for what it reads and what it refuses.
 */

// ── Quick add ────────────────────────────────────────────────────────────────

function personMatch(people: Map<string, DirectoryPerson> | null, name: string): DirectoryPerson | null {
  if (!people) return null;
  const want = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.]/g, ' ').trim();
  const found = [...people.values()].filter((p) => {
    const full = p.displayName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return full === want || full.split(/\s+/).some((part) => part === want) || full.startsWith(want);
  });
  // Only an unambiguous match: two Anas is a question for the editor, not a guess.
  return found.length === 1 ? found[0] : null;
}

export default function QuickAdd({ today, people, onWantPeople, onAdd, extra, tourId = 'quick-add' }: {
  today: string;
  people: Map<string, DirectoryPerson> | null;
  onWantPeople: () => void;
  onAdd: (input: PersonalTaskInput) => Promise<PersonalTask | null>;
  /**
   * Added to every task this box makes: the Tasks tab passes the colour tag
   * being filtered on, so a new task is not saved straight out of sight.
   */
  extra?: Partial<PersonalTaskInput>;
  /** The `data-tour` name, so each tab's tour can light its own box. */
  tourId?: string;
}) {
  const { formatCalendarDate } = useDateFormatters();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState<Record<string, TaskOrder | null | 'loading'>>({});
  const input = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => parseQuickAdd(text, today), [text, today]);

  // The directory only once somebody types an @.
  useEffect(() => { if (parsed.mentions.length) onWantPeople(); }, [parsed.mentions.length, onWantPeople]);

  // Each #number is looked up once, through the same access-checked route
  // chat's order cards use: a load the person cannot open is never attached.
  useEffect(() => {
    for (const ref of parsed.orderRefs) {
      if (ref in orders) continue;
      setOrders((o) => ({ ...o, [ref]: 'loading' }));
      loadOrderCard({ kind: 'number', value: ref }).then((card) => {
        setOrders((o) => ({ ...o, [ref]: card ? { id: card.id, number: card.number } : null }));
      });
    }
  }, [parsed.orderRefs, orders]);

  const contacts: TaskContact[] = parsed.mentions
    .map((m) => personMatch(people, m))
    .filter((p): p is DirectoryPerson => !!p)
    .map((p) => ({ email: p.email.toLowerCase(), name: p.displayName }));
  const foundOrders = parsed.orderRefs
    .map((r) => orders[r])
    .filter((o): o is TaskOrder => !!o && o !== 'loading');

  const submit = async () => {
    if (!parsed.title || busy) return;
    setBusy(true);
    const made = await onAdd({
      ...extra,
      kind: 'task',
      title: parsed.title,
      date: parsed.date,
      time: parsed.date ? parsed.time : null,
      endTime: parsed.date ? parsed.endTime : null,
      ...(parsed.urgent ? { priority: 'high' as const } : {}),
      ...(contacts.length ? { contacts } : {}),
      ...(foundOrders.length ? { orders: foundOrders } : {}),
    });
    setBusy(false);
    if (made) { setText(''); input.current?.focus(); }
  };

  const chip = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium';
  const hasChips = !!(parsed.date || parsed.time || parsed.urgent || parsed.orderRefs.length || parsed.mentions.length);

  return (
    <section data-tour={tourId} className="rounded-xl border border-gray-200 bg-white p-3">
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex items-center gap-2">
        <Plus size={18} className="ml-1 shrink-0 text-gray-400" />
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a task: “Call Rio Grande tomorrow 3pm !urgent”"
          aria-label="Quick add a task"
          maxLength={300}
          className="min-w-0 flex-1 border-0 bg-transparent py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
        />
        <button type="submit" disabled={!parsed.title || busy}
          className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
          <CornerDownLeft size={14} /> Add
        </button>
      </form>
      {text.trim() && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-gray-100 px-1 pt-2">
          <span className="text-xs text-gray-500">{parsed.title ? <>Adds <b className="text-gray-800">{parsed.title}</b></> : 'Type what the task is'}</span>
          {parsed.date && <span className={`${chip} bg-brand-50 text-brand-700`}><CalendarDays size={11} />{parsed.date === today ? 'Today' : formatCalendarDate(parsed.date)}</span>}
          {parsed.time && parsed.date && <span className={`${chip} bg-brand-50 text-brand-700`}><Clock size={11} />{formatTime(parsed.time)}{parsed.endTime ? ` – ${formatTime(parsed.endTime)}` : ''}</span>}
          {parsed.time && !parsed.date && <span className={`${chip} bg-amber-50 text-amber-800`}><Clock size={11} />A time needs a day — add “today” or “tomorrow”</span>}
          {parsed.urgent && <span className={`${chip} bg-red-50 text-red-700`}><Flag size={11} />Urgent</span>}
          {parsed.orderRefs.map((r) => {
            const o = orders[r];
            return (
              <span key={r} className={`${chip} ${o && o !== 'loading' ? 'bg-gray-100 text-gray-700' : 'bg-amber-50 text-amber-800'}`}>
                <Hash size={11} />{o === 'loading' || o === undefined ? `${r}…` : o ? o.number : `${r} not found`}
              </span>
            );
          })}
          {parsed.mentions.map((m) => {
            const p = personMatch(people, m);
            return (
              <span key={m} className={`${chip} ${p ? 'bg-gray-100 text-gray-700' : 'bg-amber-50 text-amber-800'}`}>
                <User size={11} />{p ? p.displayName : people ? `No one called “${m}”` : `${m}…`}
              </span>
            );
          })}
          {!hasChips && parsed.title && <span className="text-xs text-gray-400">· no day, so it goes to the inbox</span>}
        </div>
      )}
    </section>
  );
}
