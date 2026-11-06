import type { Bilingual } from '@/types/onboarding';
import type { Guide } from './guideTypes';

/**
 * Searching the Learn library, in the browser. The library is a few hundred
 * short passages, so a plain scan of both languages on each keystroke is
 * instant and needs no index — and nothing typed into the box leaves the
 * page.
 *
 * Accents are folded ("planificación" finds "planificacion") because people
 * type in a hurry, and every word must appear somewhere in the passage, in
 * either language.
 */

export interface SearchHit {
  guide: Guide;
  sectionId: string | null;
  sectionTitle: Bilingual | null;
  /** The passage that matched, in the language it matched in. */
  text: string;
  score: number;
}

export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

interface Passage {
  guide: Guide;
  sectionId: string | null;
  sectionTitle: Bilingual | null;
  texts: Bilingual[];
  weight: number;
}

function passages(guides: readonly Guide[]): Passage[] {
  const out: Passage[] = [];
  for (const g of guides) {
    out.push({ guide: g, sectionId: null, sectionTitle: null, texts: [g.title, g.summary], weight: 3 });
    for (const s of g.sections) {
      out.push({ guide: g, sectionId: s.id, sectionTitle: s.title, texts: [s.title], weight: 2 });
      const body: Bilingual[] = [
        ...(s.intro ? [s.intro] : []),
        ...(s.steps ?? []).map((st) => st.text),
        ...(s.points ?? []),
        ...(s.callouts ?? []).map((c) => c.text),
        ...(s.table ?? []).flat(),
        ...(s.terms ?? []).map((t) => ({ en: `${t.term} — ${t.meaning.en}`, es: `${t.term} — ${t.meaning.es}` })),
      ];
      for (const t of body) out.push({ guide: g, sectionId: s.id, sectionTitle: s.title, texts: [t], weight: 1 });
    }
    for (const f of g.faq ?? []) {
      out.push({
        guide: g, sectionId: 'faq', sectionTitle: { en: 'Common questions', es: 'Preguntas frecuentes' },
        texts: [{ en: `${f.q.en} ${f.a.en}`, es: `${f.q.es} ${f.a.es}` }], weight: 2,
      });
    }
  }
  return out;
}

let cache: { guides: readonly Guide[]; list: Passage[] } | null = null;

export function searchGuides(guides: readonly Guide[], query: string, preferSpanish: boolean, limit = 40): SearchHit[] {
  const words = fold(query).split(/\s+/).filter((w) => w.length >= 2);
  if (words.length === 0) return [];
  if (!cache || cache.guides !== guides) cache = { guides, list: passages(guides) };

  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const p of cache.list) {
    for (const t of p.texts) {
      const order = preferSpanish ? [t.es, t.en] : [t.en, t.es];
      const match = order.find((s) => { const f = fold(s); return words.every((w) => f.includes(w)); });
      if (!match) continue;
      const key = `${p.guide.id}|${p.sectionId}|${match}`;
      if (seen.has(key)) break;
      seen.add(key);
      const f = fold(match);
      // Whole-word matches and matches near the start rank higher.
      const bonus = words.reduce((n, w) => n + (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(f) ? 1 : 0), 0);
      hits.push({ guide: p.guide, sectionId: p.sectionId, sectionTitle: p.sectionTitle, text: match, score: p.weight * 10 + bonus * 3 - Math.min(5, f.indexOf(words[0]) / 40) });
      break;
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
