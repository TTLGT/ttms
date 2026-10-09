'use client';

import { useState } from 'react';
import { Check, Copy, PartyPopper, Truck } from 'lucide-react';
import { clock } from '@/lib/chatFormat';
import { linksIn, type ChatMessage } from '@/types/conversation';

/**
 * A line from the server itself, in one of two shapes — see SystemMessageKind.
 *
 * **An alert** is "Carrier signed", "BOL added": a centred line rather than a
 * bubble, and that is the whole design of it. These sit among messages from
 * colleagues, and an automated notice drawn like a person saying something is
 * a notice people answer, argue with, and eventually stop reading. Shaped like
 * the day divider above it instead, which the room already reads as "the room
 * telling you something" rather than as somebody speaking.
 *
 * **An announcement** is the company addressing the room — today, the daily
 * birthday and work-anniversary post. It is the same idea and a different
 * size, because the alert shape would actively break it: one line, truncated
 * at the width of a pill, in 11px grey. A greeting nobody can finish reading
 * is worse than no greeting. So it keeps the centred, inert treatment — still
 * visibly not a colleague — and gains the three things it needs: the sender's
 * name written out, every line of the text, and room to breathe.
 *
 * Both are inert by consequence: no arrow menu, no reactions, no thread.
 * Anything worth saying about either is said in the room under it, by a
 * person, in a bubble. That matters more for an announcement, not less —
 * "happy birthday" belongs to colleagues, and the post exists to prompt it
 * rather than to stand in for it.
 */
export default function SystemMessage({ message }: { message: ChatMessage }) {
  if (message.systemKind === 'announcement') return <Announcement message={message} />;
  if (linksIn(message.text).length > 0) return <AlertWithLinks message={message} />;

  return (
    <div className="flex justify-center py-1.5">
      <span className="flex max-w-[85%] items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] text-gray-600 shadow-sm">
        <Truck size={11} className="flex-shrink-0 text-brand-500" />
        <span className="truncate">{message.text}</span>
        <span className="flex-shrink-0 text-gray-400">{clock(message)}</span>
      </span>
    </div>
  );
}

function Announcement({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-center px-2 py-2.5">
      <div className="w-full max-w-md rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-center shadow-sm">
        <PartyPopper size={16} className="mx-auto text-brand-500" aria-hidden />
        {/* `whitespace-pre-line` because the message is built from one line per
            person and a blank line between the two kinds — collapsed, it runs
            four people into one paragraph. Never truncated. */}
        <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-gray-800">
          {message.text}
        </p>
        {/* Signed at the foot, not headed at the top. As an uppercase heading
            the company's name read like a label on a notice; as a sign-off it
            reads like the company saying it. Written out rather than shortened
            — the company is speaking, not the software it happens to run on. */}
        <p className="mt-2.5 text-[12.5px] font-medium text-brand-700">
          — {message.senderName} <span className="font-normal text-gray-400">· {clock(message)}</span>
        </p>
      </div>
    </div>
  );
}

/**
 * An alert that carries a link — the Request SA line, the signing link posted
 * when the agreement goes out. The pill shape truncates, which cut the address
 * off exactly where it mattered: a link nobody can see the end of cannot be
 * checked, and one that cannot be selected cannot be pasted to a client. So
 * this shape wraps every line, makes each address a real link, and gives it a
 * Copy button. Still centred and inert, like the pill — not a colleague.
 */
function AlertWithLinks({ message }: { message: ChatMessage }) {
  const text = message.text ?? '';
  const links = linksIn(text);
  // Same pattern as linksIn(), with a capture group so split() keeps the
  // addresses in place among the words around them.
  const parts = text.split(/((?:https?:\/\/|www\.)[^\s<>"']+)/gi);

  return (
    <div className="flex justify-center px-2 py-1.5">
      <div className="flex max-w-[85%] items-start gap-1.5 rounded-2xl bg-white px-3 py-1.5 text-[11px] text-gray-600 shadow-sm">
        <Truck size={11} className="mt-0.5 flex-shrink-0 text-brand-500" />
        <div className="min-w-0">
          <p className="select-text whitespace-pre-line break-words">
            {parts.map((part, i) => {
              if (i % 2 === 0) return part;
              // Trailing punctuation belongs to the sentence, not the address.
              const trimmed = part.replace(/[.,;:!?)\]}'"]+$/, '');
              const tail = part.slice(trimmed.length);
              const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
              return (
                <span key={i}>
                  <a href={href} target="_blank" rel="noopener noreferrer"
                     className="break-all text-brand-600 underline hover:text-brand-700">
                    {trimmed}
                  </a>
                  {tail}
                </span>
              );
            })}
            <span className="ml-1.5 text-gray-400">{clock(message)}</span>
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {links.map((url) => <CopyLink key={url} url={url} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refused (an insecure origin, a denied permission). The link
      // is still on screen and selectable, so there is nothing else to do.
    }
  }

  return (
    <button type="button" onClick={copy} title={url}
      className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50">
      {copied ? <Check size={11} className="text-green-600" /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}
