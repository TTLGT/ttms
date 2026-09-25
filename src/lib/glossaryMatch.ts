import { GLOSSARY, formsOf, isAcronym } from '@/types/glossary';

/**
 * Finding the Learn English words inside a run of text.
 *
 * Pure — a string in, positions out — so the underliner can run it over every
 * text node on the page without this module knowing there is a page.
 *
 * One regular expression over every form of every word, longest first, so
 * "bill of lading" wins over a shorter word inside it and "rate confirmation"
 * wins over "confirmation". Word edges are letters and digits in any script,
 * not `\b`, which treats "é" as a boundary and would find "rate" in "rateé".
 */

export interface GlossaryHit {
  start: number;
  end: number;
  termId: string;
}

interface FormEntry {
  termId: string;
  /** Set for BOL, ETA and the like: the match must be in capitals too. */
  exact: string | null;
}

/** Lower-cased, with runs of whitespace as one space — how a match is looked up. */
function keyOf(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ');
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let compiled: { pattern: RegExp; byForm: Map<string, FormEntry[]> } | null = null;

function compile() {
  if (compiled) return compiled;

  const byForm = new Map<string, FormEntry[]>();
  for (const term of GLOSSARY) {
    for (const form of formsOf(term)) {
      const key = keyOf(form);
      const list = byForm.get(key) ?? [];
      list.push({ termId: term.id, exact: isAcronym(form) ? form : null });
      byForm.set(key, list);
    }
  }

  const alternatives = [...byForm.keys()]
    .sort((a, b) => b.length - a.length)
    // A space in a phrase matches a line break or a double space on screen too.
    .map((key) => escape(key).replace(/ /g, '\\s+'));

  compiled = {
    pattern: new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}])`, 'giu'),
    byForm,
  };
  return compiled;
}

/** Every glossary word in `text`, left to right, never overlapping. */
export function findGlossaryWords(text: string): GlossaryHit[] {
  const { pattern, byForm } = compile();
  const hits: GlossaryHit[] = [];
  pattern.lastIndex = 0;

  for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
    const entries = byForm.get(keyOf(m[0]));
    // Of the words spelt this way, the first whose capitals agree — "pod" in
    // a sentence is not a POD, and the case-insensitive search found both.
    const entry = entries?.find((e) => e.exact === null || e.exact === m![0]);
    if (entry) hits.push({ start: m.index, end: m.index + m[0].length, termId: entry.termId });
  }
  return hits;
}
