'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Truck, X } from 'lucide-react';
import { loadOrderCard, orderRefsIn, type OrderCardData } from '@/lib/orderCards';
import { MAX_TASK_ORDERS, type TaskOrder } from '@/types/task';

/**
 * The loads a task is about: "TTL26000042" as a link to the order on every
 * view, and a box in the editor that finds one the way chat does.
 */

/**
 * The order numbers as links. Nothing at all for a task with no load on it,
 * so callers can drop it in unconditionally.
 *
 * Each link stops its click: every view puts it inside something that opens
 * the editor or starts a drag when clicked.
 */
export function TaskOrdersLine({
  orders, className = '',
}: { orders: TaskOrder[]; className?: string }) {
  if (orders.length === 0) return null;
  return (
    <span className={`inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 ${className}`}>
      {orders.map((o) => (
        <Link
          key={o.id}
          href={`/dashboard/orders/${o.id}`}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          title={`Open order ${o.number}`}
          className="inline-flex items-center gap-1 font-mono font-medium text-brand-700 underline-offset-2 hover:underline"
          data-learn-skip
        >
          <Truck size={11} className="flex-shrink-0" />
          {o.number}
        </Link>
      ))}
    </span>
  );
}

/**
 * The editor's box for adding a load. It takes what chat recognises — a
 * `TTL…` number, `#41207` for a BATS-era load, or the order's own address
 * pasted from the address bar — because that is what people already type
 * there, and `orderRefsIn()` is the one definition of it.
 *
 * Looked up when added, through the same access-checked route chat's cards
 * use, so a mistyped number or somebody else's load is caught here rather
 * than saved as a link that goes nowhere. Not found and not yours read the
 * same on purpose — the route answers both without saying which.
 */
export function TaskOrderPicker({
  value, onChange, inputClass,
}: { value: TaskOrder[]; onChange: (next: TaskOrder[]) => void; inputClass: string }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  // The cards found this visit, for the summary under each chip. Not stored:
  // status and carrier go stale, and the board draws only the number.
  const [cards, setCards] = useState<Record<string, OrderCardData>>({});
  const full = value.length >= MAX_TASK_ORDERS;

  const add = async () => {
    const typed = text.trim();
    if (!typed || busy) return;
    // A bare number is accepted without its '#': in a box that only takes
    // orders there are no weights or ZIP codes to mistake it for, which is
    // the only reason chat insists on one.
    const ref = orderRefsIn(typed)[0] ?? orderRefsIn(/^\d+$/.test(typed) ? `#${typed}` : '')[0];
    if (!ref) {
      setProblem('That does not look like an order number. Try TTL26000042, #41207, or the order’s link.');
      return;
    }
    setBusy(true);
    setProblem('');
    const card = await loadOrderCard(ref);
    setBusy(false);
    if (!card) {
      setProblem(`No order ${ref.kind === 'number' ? ref.value : 'at that link'} that you can open.`);
      return;
    }
    if (value.some((o) => o.id === card.id)) {
      setText('');
      return;
    }
    setCards((c) => ({ ...c, [card.id]: card }));
    onChange([...value, { id: card.id, number: card.number || card.id }]);
    setText('');
  };

  return (
    <div>
      {value.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {value.map((o) => {
            const card = cards[o.id];
            const lane = card ? [card.origin, card.destination].filter(Boolean).join(' → ') : '';
            return (
              <li key={o.id} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs">
                <TaskOrdersLine orders={[o]} className="text-xs" />
                {card && (
                  <span className="min-w-0 flex-1 truncate text-gray-500">
                    {[lane, card.clientName].filter(Boolean).join(' · ')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((x) => x.id !== o.id))}
                  aria-label={`Remove order ${o.number}`}
                  className="ml-auto rounded-full text-gray-400 hover:text-red-600"
                >
                  <X size={12} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {full ? (
        <p className="text-xs text-gray-500">That is the most one task can have ({MAX_TASK_ORDERS}).</p>
      ) : (
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => { setText(e.target.value); setProblem(''); }}
            onKeyDown={(e) => {
              // Enter would submit the whole task; here it adds the order.
              if (e.key === 'Enter') { e.preventDefault(); void add(); }
            }}
            placeholder="Order number or link"
            className={inputClass}
            aria-label="Add an order by number or link"
            data-learn-skip
          />
          <button
            type="button"
            onClick={() => void add()}
            disabled={!text.trim() || busy}
            className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            Add
          </button>
        </div>
      )}
      {problem && <p className="mt-1 text-xs text-red-600">{problem}</p>}
    </div>
  );
}
