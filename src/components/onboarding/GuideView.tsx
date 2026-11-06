'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, ArrowUpRight, CheckCircle2, ChevronDown, Clock, Lightbulb, AlertTriangle, Info,
  Sparkles, RotateCcw, BookOpenCheck, MousePointerClick,
} from 'lucide-react';
import type { CalloutTone, Guide, GuideSection } from '@/lib/onboarding/guideTypes';
import { GUIDES } from '@/lib/onboarding/guides';
import { SCREENS, SCREENSHOTS } from './screens';
import { SpotProvider } from './screens/Frame';
import GuideIcon, { GUIDE_TONE } from './GuideIcon';
import Quiz from './Quiz';
import { T, useBi } from './T';
import { useOnboarding } from './OnboardingProvider';
import { useDateFormatters } from '@/lib/useDateFormatters';

const CALLOUT: Record<CalloutTone, { box: string; head: string; Icon: typeof Info; label: { en: string; es: string } }> = {
  tip:     { box: 'border-blue-200 bg-blue-50',   head: 'text-blue-800',  Icon: Lightbulb,     label: { en: 'Tip', es: 'Consejo' } },
  warn:    { box: 'border-amber-200 bg-amber-50', head: 'text-amber-800', Icon: AlertTriangle, label: { en: 'Careful', es: 'Cuidado' } },
  why:     { box: 'border-purple-200 bg-purple-50', head: 'text-purple-800', Icon: Info,       label: { en: 'Why it works this way', es: 'Por qué funciona así' } },
  example: { box: 'border-green-200 bg-green-50', head: 'text-green-800', Icon: Sparkles,      label: { en: 'Example', es: 'Ejemplo' } },
};

/** One section: its drawing and its numbered steps share which marker is lit. */
function Section({ s, index }: { s: GuideSection; index: number }) {
  const [active, setActive] = useState<number | null>(null);
  const bi = useBi();
  const Screen = s.screen ? SCREENS[s.screen] : undefined;
  const shot = s.screen ? SCREENSHOTS[s.screen] : undefined;
  const labels = useMemo(() => {
    const out: Record<number, string> = {};
    for (const st of s.steps ?? []) if (st.spot && !out[st.spot]) out[st.spot] = bi(st.text);
    return out;
  }, [s.steps, bi]);
  const spotted = (s.steps ?? []).some((st) => st.spot);

  return (
    <section id={s.id} className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="flex items-start gap-3 text-lg font-bold text-gray-900">
        <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-600">{index + 1}</span>
        <span><T v={s.title} /></span>
      </h2>
      {s.intro && <p className="mt-2 text-sm leading-relaxed text-gray-600"><T v={s.intro} /></p>}

      {(Screen || shot) && (
        <div className="mt-4">
          <SpotProvider value={{ active, onSpot: (n) => setActive((a) => (a === n ? null : n)), labels }}>
            {shot ? <img src={shot} alt={bi(s.title)} className="w-full rounded-xl border border-gray-200 shadow" /> : Screen && <Screen />}
          </SpotProvider>
          {spotted && !shot && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
              <MousePointerClick size={13} />
              {bi({ en: 'Click a number on the picture, or a step below, to see which part it means.', es: 'Haz clic en un número de la imagen, o en un paso abajo, para ver qué parte es.' })}
            </p>
          )}
        </div>
      )}

      {s.steps && (
        <ol className="mt-4 space-y-2">
          {s.steps.map((st, i) => {
            const lit = st.spot !== undefined && st.spot === active;
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => st.spot && setActive((a) => (a === st.spot ? null : st.spot!))}
                  className={`flex w-full gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                    lit ? 'border-amber-300 bg-amber-50 shadow-sm' : 'border-gray-100 bg-gray-50 hover:border-brand-200 hover:bg-white'
                  } ${st.spot ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    lit ? 'bg-amber-400 text-gray-900' : st.spot ? 'bg-brand-600 text-white' : 'bg-gray-200 text-gray-700'
                  }`}>
                    {st.spot ?? i + 1}
                  </span>
                  <span className="leading-relaxed text-gray-700"><T v={st.text} /></span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {s.points && (
        <ul className="mt-4 space-y-2">
          {s.points.map((p, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-gray-700">
              <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0 text-brand-500" />
              <span><T v={p} /></span>
            </li>
          ))}
        </ul>
      )}

      {s.table && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-gray-50">
              <tr>{s.table[0].map((h, i) => <th key={i} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"><T v={h} /></th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {s.table.slice(1).map((row, r) => (
                <tr key={r} className="align-top">
                  {row.map((c, i) => <td key={i} className={`px-3 py-2 ${i === 0 ? 'font-medium text-gray-900' : 'text-gray-600'}`}><T v={c} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {s.terms && (
        <dl className="mt-4 grid gap-2 sm:grid-cols-2">
          {s.terms.map((t) => (
            <div key={t.term} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
              <dt className="text-sm font-semibold text-gray-900">{t.term}</dt>
              <dd className="mt-0.5 text-sm text-gray-600"><T v={t.meaning} /></dd>
            </div>
          ))}
        </dl>
      )}

      {s.callouts && (
        <div className="mt-4 space-y-2">
          {s.callouts.map((c, i) => {
            const { box, head, Icon, label } = CALLOUT[c.tone];
            return (
              <div key={i} className={`rounded-xl border px-4 py-3 ${box}`}>
                <p className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${head}`}><Icon size={14} /> {bi(label)}</p>
                <p className="mt-1 text-sm leading-relaxed text-gray-700"><T v={c.text} /></p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function GuideView({ guide }: { guide: Guide }) {
  const { data, finishGuide, reopenGuide, busy } = useOnboarding();
  const { formatDate } = useDateFormatters();
  const bi = useBi();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [current, setCurrent] = useState(guide.sections[0]?.id ?? '');
  const mark = data?.program.guides[guide.id];

  // Lights the section being read in the contents list.
  useEffect(() => {
    const els = guide.sections.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((entries) => {
      const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (seen[0]) setCurrent(seen[0].target.id);
    }, { rootMargin: '-20% 0px -60% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [guide]);

  // A link from search lands on a section by its hash; scroll there once drawn.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }));
  }, []);

  const idx = GUIDES.findIndex((g) => g.id === guide.id);
  const next = GUIDES[idx + 1];

  return (
    <div className="pb-16">
      <Link href="/dashboard/onboarding/learn" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-700">
        <ArrowLeft size={14} /> {bi({ en: 'All guides', es: 'Todas las guías' })}
      </Link>

      <header className="mt-3 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-brand-50 via-white to-white p-5 sm:p-7">
          <div className="flex flex-wrap items-start gap-4">
            <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${GUIDE_TONE[guide.icon]}`}><GuideIcon name={guide.icon} size={28} /></span>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl"><T v={guide.title} /></h1>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-gray-600"><T v={guide.summary} /></p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-gray-600"><Clock size={12} /> {guide.minutes} min</span>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">{guide.sections.length} {bi({ en: 'sections', es: 'secciones' })}</span>
                {mark && <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 font-medium text-green-800"><CheckCircle2 size={12} /> {bi({ en: 'Finished', es: 'Terminada' })} {formatDate(mark.at)}</span>}
              </div>
            </div>
            {guide.tryHref && (
              <Link href={guide.tryHref} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">
                {bi({ en: 'Try it now', es: 'Pruébalo ahora' })} <ArrowUpRight size={15} />
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav className="hidden lg:block">
          <div className="sticky top-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
            <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{bi({ en: 'In this guide', es: 'En esta guía' })}</p>
            <ol className="space-y-0.5">
              {guide.sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className={`flex gap-2 rounded-lg px-2 py-1.5 text-sm transition ${current === s.id ? 'bg-brand-50 font-medium text-brand-700' : 'text-gray-600 hover:bg-gray-50'}`}>
                    <span className="w-4 flex-shrink-0 text-right text-xs text-gray-400">{i + 1}</span> {bi(s.title)}
                  </a>
                </li>
              ))}
              {guide.faq && <li><a href="#faq" className="block rounded-lg px-2 py-1.5 pl-8 text-sm text-gray-600 hover:bg-gray-50">{bi({ en: 'Questions', es: 'Preguntas' })}</a></li>}
              {guide.quiz && <li><a href="#check" className="block rounded-lg px-2 py-1.5 pl-8 text-sm text-gray-600 hover:bg-gray-50">{bi({ en: 'Quick check', es: 'Revisión rápida' })}</a></li>}
            </ol>
          </div>
        </nav>

        <div className="min-w-0 space-y-5">
          {guide.sections.map((s, i) => <Section key={s.id} s={s} index={i} />)}

          {guide.faq && (
            <section id="faq" className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-bold text-gray-900">{bi({ en: 'Common questions', es: 'Preguntas frecuentes' })}</h2>
              <div className="mt-3 divide-y divide-gray-100">
                {guide.faq.map((f, i) => (
                  <div key={i}>
                    <button type="button" onClick={() => setOpenFaq(openFaq === i ? null : i)} className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm font-medium text-gray-900">
                      <span><T v={f.q} /></span>
                      <ChevronDown size={16} className={`flex-shrink-0 text-gray-400 transition ${openFaq === i ? 'rotate-180' : ''}`} />
                    </button>
                    {openFaq === i && <p className="pb-3 text-sm leading-relaxed text-gray-600"><T v={f.a} /></p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {guide.quiz && (
            <section id="check" className="scroll-mt-24">
              <Quiz questions={guide.quiz} onPassed={(score, total) => { void finishGuide(guide.id, score, total).catch(() => {}); }} />
            </section>
          )}

          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-brand-300 bg-brand-50/50 p-6 text-center">
            <BookOpenCheck size={28} className="text-brand-600" />
            {mark ? (
              <>
                <p className="text-sm font-semibold text-gray-900">{bi({ en: 'You finished this guide.', es: 'Terminaste esta guía.' })}{mark.score !== undefined && mark.total ? ` ${bi({ en: 'Best quick check', es: 'Mejor revisión' })}: ${mark.score}/${mark.total}` : ''}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {next && <Link href={`/dashboard/onboarding/learn/${next.id}`} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">{bi({ en: 'Next guide', es: 'Siguiente guía' })}: {bi(next.title)}</Link>}
                  <button type="button" disabled={busy} onClick={() => void reopenGuide(guide.id).catch(() => {})} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    <RotateCcw size={14} /> {bi({ en: 'Mark as not finished', es: 'Marcar como no terminada' })}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-700">{bi({ en: 'Read it all and tried it in TTMS? Mark it finished — it counts on your onboarding.', es: '¿La leíste completa y la probaste en TTMS? Márcala como terminada — cuenta en tu onboarding.' })}</p>
                <button type="button" disabled={busy || !data} onClick={() => void finishGuide(guide.id).catch(() => {})} className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50">
                  {bi({ en: 'I finished this guide', es: 'Terminé esta guía' })}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
