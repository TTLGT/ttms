'use client';

import { useState } from 'react';
import { CheckCircle2, ClipboardCheck, Lock, Send } from 'lucide-react';
import { useOnboarding } from '@/components/onboarding/OnboardingProvider';
import { T, useBi } from '@/components/onboarding/T';
import { RATING_LABELS, SURVEYS, type Survey } from '@/lib/onboarding/surveys';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { MAX_SURVEY_TEXT } from '@/types/onboarding';

/**
 * The onboarding surveys. Each is sent once; only HR (and whoever runs
 * onboarding) reads the answers — a team lead never does, and the page says
 * so before anybody starts typing.
 */
export default function SurveysPage() {
  const { data, loading } = useOnboarding();
  const bi = useBi();
  const [open, setOpen] = useState<string | null>(null);
  if (loading || !data) return <div className="h-48 animate-pulse rounded-2xl bg-gray-100" />;
  const sent = data.program.surveys ?? {};

  return (
    <div className="space-y-4 pb-16">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{bi({ en: 'Your surveys', es: 'Tus encuestas' })}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500"><Lock size={14} /> {bi({ en: 'Only HR reads your answers. Your team lead does not see them.', es: 'Solo RR. HH. lee tus respuestas. Tu líder de equipo no las ve.' })}</p>
      </div>
      {SURVEYS.map((s) => (
        <SurveyCard key={s.id} survey={s} submittedAt={sent[s.id]?.submittedAt ?? null} open={open === s.id} onOpen={() => setOpen(open === s.id ? null : s.id)} />
      ))}
    </div>
  );
}

function SurveyCard({ survey, submittedAt, open, onOpen }: { survey: Survey; submittedAt: string | null; open: boolean; onOpen: () => void }) {
  const { sendSurvey, busy, error } = useOnboarding();
  const { formatDate } = useDateFormatters();
  const bi = useBi();
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const total = survey.sections.reduce((n, s) => n + s.questions.length, 0);
  const answered = Object.values(answers).filter((v) => v !== '').length;

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <button type="button" onClick={onOpen} disabled={!!submittedAt} className="flex w-full items-center gap-4 p-5 text-left disabled:cursor-default">
        <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${submittedAt ? 'bg-green-100 text-green-700' : 'bg-brand-50 text-brand-700'}`}>
          {submittedAt ? <CheckCircle2 size={22} /> : <ClipboardCheck size={22} />}
        </span>
        <span className="flex-1">
          <span className="block text-base font-bold text-gray-900"><T v={survey.title} /></span>
          <span className="block text-sm text-gray-500">{bi(survey.when)} · {total} {bi({ en: 'questions', es: 'preguntas' })}</span>
        </span>
        {submittedAt
          ? <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">{bi({ en: 'Sent', es: 'Enviada' })} {formatDate(submittedAt)}</span>
          : <span className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">{open ? bi({ en: 'Close', es: 'Cerrar' }) : bi({ en: 'Start', es: 'Empezar' })}</span>}
      </button>

      {open && !submittedAt && (
        <div className="border-t border-gray-100 p-5">
          <p className="mb-5 rounded-xl bg-gray-50 p-3 text-sm text-gray-600"><T v={survey.intro} /></p>
          {survey.sections.map((sec) => (
            <div key={sec.title.en} className="mb-6">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">{bi(sec.title)}</h3>
              <div className="space-y-4">
                {sec.questions.map((q) => (
                  <div key={q.id}>
                    <p className="text-sm font-medium text-gray-900"><T v={q.text} /></p>
                    {q.kind === 'rating' ? (
                      <div className="mt-2 grid grid-cols-5 gap-1.5">
                        {RATING_LABELS.map((l, i) => {
                          const v = i + 1;
                          const on = answers[q.id] === v;
                          return (
                            <button key={v} type="button" onClick={() => setAnswers((a) => ({ ...a, [q.id]: v }))}
                              className={`rounded-xl border px-1 py-2 text-center text-xs transition ${on ? 'border-brand-500 bg-brand-600 font-semibold text-white' : 'border-gray-200 text-gray-600 hover:border-brand-300'}`}>
                              <span className="block text-base font-bold">{v}</span>{bi(l)}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <textarea
                        value={(answers[q.id] as string) ?? ''}
                        onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value.slice(0, MAX_SURVEY_TEXT) }))}
                        rows={3}
                        className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={busy || answered === 0}
              onClick={() => { void sendSurvey(survey.id, answers).catch(() => {}); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
              <Send size={15} /> {bi({ en: 'Send to HR', es: 'Enviar a RR. HH.' })}
            </button>
            <span className="text-xs text-gray-500">{answered}/{total} {bi({ en: 'answered · you can skip any question, and it is sent only once', es: 'respondidas · puedes saltar cualquier pregunta, y se envía una sola vez' })}</span>
          </div>
        </div>
      )}
    </section>
  );
}
