import type { MentionCandidate } from '@/types/conversation';

/**
 * Turning message text into the runs a thread draws.
 *
 * The marks are WhatsApp's, not Markdown's — `*bold*`, `_italic_`, `~struck~`,
 * `` `code` `` — because the bubbles are WhatsApp's too, and because these are
 * the ones staff already have in their fingers from their phones. Markdown's
 * doubled asterisk for bold would be a second set of rules to learn for no
 * gain here.
 *
 * Formatting, links and mentions are found in one pass rather than layered
 * over each other. Running three separate passes means the second one rewriting
 * text the first has already turned into markup, which is how a URL containing
 * an underscore ends up half italic.
 *
 * Marks do not nest. Bold inside italic is not worth the tokenizer it would
 * take, and nobody has ever needed it to say a truck is late.
 */

export type RunMark = 'bold' | 'italic' | 'strike' | 'code';

export interface Run {
  text: string;
  mark: RunMark | null;
  /** The uid this run names, when it is a mention. */
  mentionUid: string | null;
  /** Where this run points, when it is a link. */
  href: string | null;
}

function escapeForRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Trailing punctuation that is nearly always sentence, not address. */
const URL_TAIL = /[.,;:!?)\]]+$/;

export function formatMessage(text: string, named: MentionCandidate[]): Run[] {
  const plain = (t: string): Run => ({ text: t, mark: null, mentionUid: null, href: null });
  if (!text) return [];

  const mentionAlternation = named
    .filter((c) => c.displayName.trim())
    .sort((a, b) => b.displayName.length - a.displayName.length)
    .map((c) => escapeForRegex(c.displayName))
    .join('|');

  const source = [
    // Code first, so backticks win and nothing inside them is interpreted.
    '(?<code>`[^`\\n]+`)',
    '(?<bold>\\*[^*\\n]+\\*)',
    // The underscore form has to be fenced off from word characters or every
    // snake_case identifier pasted into chat comes out half italic. The
    // leading character is captured rather than looked behind — lookbehind is
    // still missing from older Safari — and put straight back as plain text.
    '(?<ipre>^|[^\\w])(?<italic>_[^_\\n]+_)(?=$|[^\\w])',
    '(?<strike>~[^~\\n]+~)',
    '(?<url>https?:\\/\\/[^\\s<>"]+|www\\.[^\\s<>"]+)',
    ...(mentionAlternation ? [`(?<mention>@(?:${mentionAlternation})\\b)`] : []),
  ].join('|');

  const token = new RegExp(source, 'gi');
  const runs: Run[] = [];
  let cursor = 0;

  for (const match of text.matchAll(token)) {
    const at = match.index ?? 0;
    const groups = match.groups ?? {};

    if (at > cursor) runs.push(plain(text.slice(cursor, at)));
    cursor = at + match[0].length;

    // The character that fenced off an underscore belongs to the text, not to
    // the italics.
    if (groups.ipre) runs.push(plain(groups.ipre));

    if (groups.code) {
      runs.push({ text: groups.code.slice(1, -1), mark: 'code', mentionUid: null, href: null });
    } else if (groups.bold) {
      runs.push({ text: groups.bold.slice(1, -1), mark: 'bold', mentionUid: null, href: null });
    } else if (groups.italic) {
      runs.push({ text: groups.italic.slice(1, -1), mark: 'italic', mentionUid: null, href: null });
    } else if (groups.strike) {
      runs.push({ text: groups.strike.slice(1, -1), mark: 'strike', mentionUid: null, href: null });
    } else if (groups.url) {
      // "Call me about ttl.com/loads." ends in a full stop that belongs to the
      // sentence. Anything trimmed here is pushed back as ordinary text.
      const trimmed = groups.url.replace(URL_TAIL, '');
      const tail    = groups.url.slice(trimmed.length);
      runs.push({
        text: trimmed,
        mark: null,
        mentionUid: null,
        href: trimmed.startsWith('http') ? trimmed : `https://${trimmed}`,
      });
      if (tail) runs.push(plain(tail));
    } else if (groups.mention) {
      const name = groups.mention.slice(1).toLowerCase();
      const who  = named.find((c) => c.displayName.toLowerCase() === name);
      runs.push({
        text: groups.mention,
        mark: null,
        mentionUid: who?.uid ?? null,
        href: null,
      });
    }
  }

  if (cursor < text.length) runs.push(plain(text.slice(cursor)));
  return runs;
}
