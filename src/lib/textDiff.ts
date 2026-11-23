/**
 * What changed between two versions of a text, word by word — for showing a
 * change to the agreement terms the way Word's tracked changes do.
 *
 * Two passes, for speed. The terms run to twenty thousand characters, and a
 * word-by-word comparison of the whole of both is millions of steps on every
 * keystroke. So the lines are matched first (a few hundred at most), and only
 * the stretches of lines that differ are compared word by word. A clause
 * rewritten in one paragraph costs that paragraph's words, not the document's.
 */

export type DiffSegment = { kind: 'same' | 'add' | 'del'; text: string };

/** Longest common subsequence over two token lists, as same/add/del runs. */
function lcs(a: string[], b: string[]): DiffSegment[] {
  const n = a.length;
  const m = b.length;
  // A stretch this long is a rewrite, not an edit: show it as replaced rather
  // than spend a quarter of a second finding three words in common.
  if (n * m > 400_000) {
    return [
      ...(n ? [{ kind: 'del' as const, text: a.join('') }] : []),
      ...(m ? [{ kind: 'add' as const, text: b.join('') }] : []),
    ];
  }
  const w = m + 1;
  const table = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * w + j] = a[i] === b[j]
        ? table[(i + 1) * w + j + 1] + 1
        : Math.max(table[(i + 1) * w + j], table[i * w + j + 1]);
    }
  }
  const out: DiffSegment[] = [];
  const push = (kind: DiffSegment['kind'], text: string) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { push('same', a[i]); i++; j++; }
    else if (table[(i + 1) * w + j] >= table[i * w + j + 1]) { push('del', a[i]); i++; }
    else { push('add', b[j]); j++; }
  }
  while (i < n) push('del', a[i++]);
  while (j < m) push('add', b[j++]);
  return out;
}

/** Words with the space after each kept on it, so joining gives the text back. */
function words(s: string): string[] {
  return s.match(/\S+\s*|\s+/g) ?? [];
}

/** Lines with their newline kept on them, for the same reason. */
function lines(s: string): string[] {
  return s.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

export function diffText(before: string, after: string): DiffSegment[] {
  if (before === after) return before ? [{ kind: 'same', text: before }] : [];
  const byLine = lcs(lines(before), lines(after));

  // Re-compare each removed-then-added stretch word by word, so one changed
  // word reads as one changed word and not a whole struck-out paragraph.
  const out: DiffSegment[] = [];
  const push = (seg: DiffSegment) => {
    const last = out[out.length - 1];
    if (last && last.kind === seg.kind) last.text += seg.text;
    else out.push({ ...seg });
  };
  for (let k = 0; k < byLine.length; k++) {
    const seg = byLine[k];
    const next = byLine[k + 1];
    if (seg.kind === 'del' && next?.kind === 'add') {
      for (const s of lcs(words(seg.text), words(next.text))) push(s);
      k++;
    } else {
      push(seg);
    }
  }
  return out;
}

/** How many words were added and taken out — for a one-line summary. */
export function diffCounts(segments: DiffSegment[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const s of segments) {
    const n = (s.text.match(/\S+/g) ?? []).length;
    if (s.kind === 'add') added += n;
    if (s.kind === 'del') removed += n;
  }
  return { added, removed };
}
