'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, RotateCcw, GraduationCap } from 'lucide-react';
import type { QuizQuestion } from '@/lib/onboarding/guideTypes';
import { T, useBi } from './T';

/**
 * The quick check at the end of a guide. Practice, not an exam: any answer
 * can be changed until "Check my answers", the reason is shown for each,
 * and it can be taken again. Passing (every answer right) also marks the
 * guide finished with the score, which is the one thing it reports.
 */
export default function Quiz({ questions, onPassed }: {
  questions: QuizQuestion[];
  onPassed: (score: number, total: number) => void;
}) {
  const bi = useBi();
  const [picks, setPicks] = useState<(number | null)[]>(() => questions.map(() => null));
  const [checked, setChecked] = useState(false);
  const score = picks.filter((p, i) => p === questions[i].answer).length;
  const all = picks.every((p) => p !== null);

  function check() {
    setChecked(true);
    if (score === questions.length) onPassed(score, questions.length);
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <GraduationCap size={20} className="text-brand-600" /> {bi({ en: 'Quick check', es: 'Revisión rápida' })}
      </h2>
      <p className="mt-1 text-sm text-gray-500">{bi({ en: 'Not a test — a way to see what stuck. Get them all right and the guide is marked finished.', es: 'No es un examen — es para ver qué aprendiste. Acierta todas y la guía se marca como terminada.' })}</p>

      <div className="mt-4 space-y-5">
        {questions.map((q, qi) => (
          <fieldset key={qi}>
            <legend className="text-sm font-semibold text-gray-900">{qi + 1}. <T v={q.q} /></legend>
            <div className="mt-2 grid gap-2">
              {q.options.map((o, oi) => {
                const picked = picks[qi] === oi;
                const right = oi === q.answer;
                const tone = !checked
                  ? picked ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-brand-200'
                  : right ? 'border-green-300 bg-green-50' : picked ? 'border-red-300 bg-red-50' : 'border-gray-200 opacity-60';
                return (
                  <button
                    key={oi}
                    type="button"
                    disabled={checked}
                    onClick={() => setPicks((p) => p.map((v, i) => (i === qi ? oi : v)))}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm text-gray-700 transition ${tone}`}
                  >
                    {checked && right ? <CheckCircle2 size={16} className="flex-shrink-0 text-green-600" />
                      : checked && picked ? <XCircle size={16} className="flex-shrink-0 text-red-600" />
                      : <span className={`h-4 w-4 flex-shrink-0 rounded-full border-2 ${picked ? 'border-brand-600 bg-brand-600' : 'border-gray-300'}`} />}
                    <span><T v={o} /></span>
                  </button>
                );
              })}
            </div>
            {checked && <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600"><T v={q.why} /></p>}
          </fieldset>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {!checked ? (
          <button type="button" disabled={!all} onClick={check} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
            {bi({ en: 'Check my answers', es: 'Revisar mis respuestas' })}
          </button>
        ) : (
          <>
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${score === questions.length ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
              {score}/{questions.length} {score === questions.length ? bi({ en: '— all right!', es: '— ¡todas bien!' }) : ''}
            </span>
            <button type="button" onClick={() => { setChecked(false); setPicks(questions.map(() => null)); }} className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-brand-700">
              <RotateCcw size={14} /> {bi({ en: 'Try again', es: 'Intentar de nuevo' })}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
