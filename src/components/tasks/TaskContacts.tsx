'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { AtSign, Hash, Phone, Search, UserRound, X } from 'lucide-react';
import type { DirectoryPerson } from '@/lib/directory';
import { personHref } from '@/lib/directoryProfile';
import { telHref } from '@/lib/phone';
import { useAuth } from '@/context/AuthContext';
import Fact from '@/components/people/Fact';
import MessagePersonButton from '@/components/chat/MessagePersonButton';
import { MAX_TASK_CONTACTS, type TaskContact } from '@/types/task';

/**
 * The colleagues a task is with: "with @Maria Lopez" on every view, and a
 * card with their email, numbers and a Message button one click away.
 *
 * The directory reaches the views through a context rather than a prop down
 * five of them, because a chip sits several components deep in each and
 * needs nothing else from the page. Null until it has loaded — see
 * useTaskDirectory() — and every chip still draws its stored name meanwhile.
 */

const DirectoryContext = createContext<Map<string, DirectoryPerson> | null>(null);

export function TaskDirectoryProvider({
  people, children,
}: { people: Map<string, DirectoryPerson> | null; children: React.ReactNode }) {
  return <DirectoryContext.Provider value={people}>{children}</DirectoryContext.Provider>;
}

/** The name the directory has now, or the one stored with the task. */
function useContactName(c: TaskContact): string {
  return useContext(DirectoryContext)?.get(c.email)?.displayName ?? c.name;
}

/**
 * "with @A, @B" — or just "@A, @B" without a prefix. Nothing at all for a
 * task with nobody on it, so callers can drop it in unconditionally.
 */
export function TaskContactsLine({
  contacts, prefix, className = '',
}: { contacts: TaskContact[]; prefix?: string; className?: string }) {
  if (contacts.length === 0) return null;
  return (
    <span className={`inline-flex min-w-0 flex-wrap items-baseline gap-x-1 ${className}`}>
      {prefix && <span className="opacity-70">{prefix}</span>}
      {contacts.map((c, i) => (
        <span key={c.email} className="inline-flex items-baseline">
          <ContactChip contact={c} />
          {i < contacts.length - 1 && <span className="opacity-70">,</span>}
        </span>
      ))}
    </span>
  );
}

/**
 * One "@Name". A real button, and its clicks stop here: every view puts it
 * inside something that opens the editor or starts a drag when clicked.
 *
 * The card is drawn in a portal at a fixed position, because the path's cards
 * and the board's columns clip what overflows them. React still bubbles a
 * portal's events to the chip's parents, which is why the card stops them too.
 */
export function ContactChip({ contact }: { contact: TaskContact }) {
  const name = useContactName(contact);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={button}
        type="button"
        draggable={false}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        onKeyDown={(e) => e.stopPropagation()}
        title={`Contact ${name}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="font-medium underline-offset-2 hover:underline"
        data-learn-skip
      >
        @{name}
      </button>
      {open && <ContactCard contact={contact} anchor={button} onClose={() => setOpen(false)} />}
    </>
  );
}

function ContactCard({
  contact, anchor, onClose,
}: { contact: TaskContact; anchor: React.RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const people = useContext(DirectoryContext);
  const person = people?.get(contact.email) ?? null;
  const card = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const name = person?.displayName ?? contact.name;

  // Under the chip, kept on screen; above it when there is no room below.
  useLayoutEffect(() => {
    const a = anchor.current?.getBoundingClientRect();
    const c = card.current?.getBoundingClientRect();
    if (!a || !c) return;
    const gap = 6;
    const left = Math.max(8, Math.min(a.left, window.innerWidth - c.width - 8));
    const below = a.bottom + gap;
    const top = below + c.height > window.innerHeight - 8 ? Math.max(8, a.top - gap - c.height) : below;
    setPos({ top, left });
  }, [anchor, people]);

  // A fixed card does not follow its chip, so a scroll closes it rather than
  // leaving it floating over the wrong task.
  useEffect(() => {
    const away = (e: Event) => {
      const t = e.target as Node;
      if (card.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', away);
    window.addEventListener('scroll', away, true);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('scroll', away, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={card}
      role="dialog"
      aria-label={`Contact ${name}`}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      className="group fixed z-[60] w-72 rounded-xl border border-gray-200 bg-white p-4 text-left text-gray-900 shadow-xl"
      data-learn-skip
    >
      <div className="flex items-start gap-2">
        <UserRound size={16} className="mt-0.5 flex-shrink-0 text-gray-400" />
        <p className="min-w-0 flex-1 break-words text-sm font-semibold">{name}</p>
        <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 rounded p-1 text-gray-400 hover:bg-gray-100">
          <X size={14} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-[14px_1fr] items-start gap-x-2 gap-y-1.5">
        <Fact Icon={AtSign} href={`mailto:${contact.email}`} copy={contact.email} copyLabel="email address">
          {contact.email}
        </Fact>
        {person?.phone && (
          <Fact Icon={Phone} href={telHref(person.phone, 'US')} copy={person.phone} copyLabel="work phone">
            {person.phone}
          </Fact>
        )}
        {/* Copyable, not dialable — see the same line on the directory cards. */}
        {person?.extension && (
          <Fact Icon={Hash} copy={person.extension} copyLabel="extension">ext. {person.extension}</Fact>
        )}
      </div>

      {people === null ? (
        <p className="mt-2 text-xs text-gray-400">Looking them up…</p>
      ) : !person ? (
        // Left, suspended, or never in this person's view of the directory.
        // The address is still what was saved, so it stays above.
        <p className="mt-2 text-xs text-amber-700">Not in the directory any more.</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {person?.uid && (
          <MessagePersonButton
            uid={person.uid}
            name={name}
            label="Message"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50"
            iconSize={13}
          />
        )}
        {person && (
          <Link href={personHref(contact.email)} className="text-xs text-brand-700 hover:underline">
            Open in directory
          </Link>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * The editor's box for adding people: the chosen ones as removable chips,
 * and a search over the directory under them. Yourself and anyone suspended
 * are left out of the choices — the second only ever appears in an admin's
 * or HR's directory, and nobody should be pointed at an account that is off.
 */
export function TaskContactPicker({
  value, onChange, inputClass,
}: { value: TaskContact[]; onChange: (next: TaskContact[]) => void; inputClass: string }) {
  const people = useContext(DirectoryContext);
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const me = user?.email?.toLowerCase() ?? '';
  const full = value.length >= MAX_TASK_CONTACTS;

  const matches = useMemo(() => {
    if (!people) return [];
    const q = query.trim().toLowerCase();
    const taken = new Set(value.map((c) => c.email));
    return [...people.values()]
      .filter((p) => !p.suspended && p.email.toLowerCase() !== me && !taken.has(p.email.toLowerCase()))
      .filter((p) => !q || p.displayName.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
      .slice(0, 8);
  }, [people, query, value, me]);

  const add = (p: DirectoryPerson) => {
    onChange([...value, { email: p.email.toLowerCase(), name: p.displayName }]);
    setQuery('');
  };

  return (
    <div>
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((c) => (
            <span key={c.email} className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-800">
              @{people?.get(c.email)?.displayName ?? c.name}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x.email !== c.email))}
                aria-label={`Remove ${c.name}`}
                className="rounded-full text-gray-400 hover:text-red-600"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      {full ? (
        <p className="text-xs text-gray-500">That is the most one task can have ({MAX_TASK_CONTACTS}).</p>
      ) : (
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            // Late enough for a click on a match to land first.
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onKeyDown={(e) => {
              // Enter would submit the whole task; here it picks the first match.
              if (e.key === 'Enter') {
                e.preventDefault();
                if (matches[0]) add(matches[0]);
              }
            }}
            placeholder={people ? 'Search the directory' : 'Loading the directory…'}
            className={`${inputClass} pl-8`}
            aria-label="Add a contact from the directory"
          />
          {focused && people && (
            <ul className="absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              {matches.length === 0 ? (
                <li className="px-3 py-2 text-xs text-gray-500">Nobody matches.</li>
              ) : matches.map((p) => (
                <li key={p.email}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => add(p)}
                    className="flex w-full flex-col px-3 py-1.5 text-left hover:bg-gray-50"
                  >
                    <span className="text-sm text-gray-900">{p.displayName}</span>
                    <span className="text-xs text-gray-500">{p.email}{p.extension ? ` · ext. ${p.extension}` : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
