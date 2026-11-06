'use client';

import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Clock, Search, Star, X } from 'lucide-react';
import { useOnboarding } from '@/components/onboarding/OnboardingProvider';
import GuideIcon, { GUIDE_TONE } from '@/components/onboarding/GuideIcon';
import { T, useBi } from '@/components/onboarding/T';
import { GUIDES, GUIDE_GROUP_ORDER, guideForTrack } from '@/lib/onboarding/guides';
import { GUIDE_GROUP_LABEL } from '@/lib/onboarding/guideTypes';
import { fold, searchGuides } from '@/lib/onboarding/search';
import { useSpanish } from '@/context/SpanishContext';

/** Show the words that matched, so a result says why it is there. */
function Highlight({ text, query }: { text: string; query: string }) {
  const words = fold(query).split(/\s+/).filter((w) => w.length >= 2);
  const f = fold(text);
  const marks: [number, number][] = [];
  for (const w of words) {
    let i = f.indexOf(w);
    while (i !== -1) { marks.push([i, i + w.length]); i = f.indexOf(w, i + w.length); }
  }
  marks.sort((a, b) => a[0] - b[0]);
  const out: React.ReactNode[] = [];
  let at = 0;
  for (const [s, e] of marks) {
    if (s < at) continue;
    out.push(text.slice(at, s), <mark key={s} className="rounded bg-amber-200 px-0.5 text-gray-900">{text.slice(s, e)}</mark>);
    at = e;
  }
  out.push(text.slice(at));
  return <>{out.map((n, i) => <Fragment key={i}>{n}</Fragment>)}</>;
}

const SUGGESTIONS = [
  { en: 'mute a room', es: 'silenciar sala' },
  { en: 'repeat', es: 'repetir' },
  { en: 'broker fee', es: 'comisión' },
  { en: 'BOL', es: 'BOL' },
  { en: 'invite', es: 'invitar' },
  { en: 'damage', es: 'daño' },
  { en: 'extension', es: 'extensión' },
  { en: 'objection', es: 'objeción' },
];

export default function LearnPage() {
  const { data } = useOnboarding();
  const { on: spanish } = useSpanish();
  const bi = useBi();
  const [q, setQ] = useState('');
  const hits = useMemo(() => searchGuides(GUIDES, q, spanish), [q, spanish]);
  const track = data?.program.track ?? 'broker';
  const finished = data?.program.guides ?? {};

  return (
    <div className="space-y-8 pb-16">
      <section className="rounded-3xl border border-gray-200 bg-gradient-to-br from-white via-brand-50/40 to-indigo-50/40 p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{bi({ en: 'How can we help?', es: '¿Cómo te podemos ayudar?' })}</h1>
        <p className="mt-1 text-sm text-gray-600">{bi({ en: 'Search every guide — in English or Spanish — or pick one below.', es: 'Busca en todas las guías — en inglés o español — o elige una abajo.' })}</p>
        <div className="relative mt-4">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={bi({ en: 'How do I mute a room? What is a BOL? Where do I set a reminder?', es: '¿Cómo silencio una sala? ¿Qué es un BOL? ¿Dónde pongo un recordatorio?' })}
            className="w-full rounded-2xl border border-gray-300 bg-white py-3.5 pl-11 pr-10 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
            autoFocus
          />
          {q && (
            <button type="button" onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600" aria-label={bi({ en: 'Clear', es: 'Borrar' })}>
              <X size={16} />
            </button>
          )}
        </div>
        {!q && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button key={s.en} type="button" onClick={() => setQ(bi(s))} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 hover:border-brand-300 hover:text-brand-700">
                {bi(s)}
              </button>
            ))}
          </div>
        )}
      </section>

      {q.trim().length >= 2 ? (
        <section>
          <p className="mb-3 text-sm text-gray-500">
            {hits.length
              ? bi({ en: `${hits.length} answers`, es: `${hits.length} respuestas` })
              : bi({ en: 'Nothing matches that. Try a shorter word, or ask in chat — and tell your trainer, so the answer can be added here.', es: 'Nada coincide. Prueba una palabra más corta, o pregunta en el chat — y avísale a tu trainer, para agregar la respuesta aquí.' })}
          </p>
          <ul className="space-y-2">
            {hits.map((h, i) => (
              <li key={i}>
                <Link
                  href={`/dashboard/onboarding/learn/${h.guide.id}${h.sectionId ? `#${h.sectionId}` : ''}`}
                  className="flex gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md"
                >
                  <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${GUIDE_TONE[h.guide.icon]}`}><GuideIcon name={h.guide.icon} size={17} /></span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-gray-500">{bi(h.guide.title)}{h.sectionTitle ? ` › ${bi(h.sectionTitle)}` : ''}</span>
                    <span className="mt-0.5 block text-sm text-gray-800"><Highlight text={h.text} query={q} /></span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        GUIDE_GROUP_ORDER.map((group) => {
          const list = GUIDES.filter((g) => g.group === group);
          if (!list.length) return null;
          return (
            <section key={group}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{bi(GUIDE_GROUP_LABEL[group])}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((g) => {
                  const done = finished[g.id];
                  const forYou = guideForTrack(g, track);
                  return (
                    <Link
                      key={g.id}
                      href={`/dashboard/onboarding/learn/${g.id}`}
                      className="group relative flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between">
                        <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${GUIDE_TONE[g.icon]}`}><GuideIcon name={g.icon} size={22} /></span>
                        {done ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800"><CheckCircle2 size={12} /> {bi({ en: 'Finished', es: 'Terminada' })}</span>
                        ) : forYou ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800"><Star size={11} /> {bi({ en: 'For you', es: 'Para ti' })}</span>
                        ) : null}
                      </div>
                      <h3 className="mt-3 text-base font-bold text-gray-900"><T v={g.title} /></h3>
                      <p className="mt-1 line-clamp-3 flex-1 text-sm text-gray-600">{bi(g.summary)}</p>
                      <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1"><Clock size={12} /> {g.minutes} min · {g.sections.length} {bi({ en: 'sections', es: 'secciones' })}</span>
                        <ArrowRight size={15} className="text-brand-600 transition group-hover:translate-x-1" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
