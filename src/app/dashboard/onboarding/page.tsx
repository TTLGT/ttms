'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, BookOpen, CheckCircle2, Flag, Handshake, Info, Sparkles } from 'lucide-react';
import { useOnboarding } from '@/components/onboarding/OnboardingProvider';
import ProgressRing from '@/components/onboarding/ProgressRing';
import StepRow from '@/components/onboarding/StepRow';
import { T, useBi } from '@/components/onboarding/T';
import { CHECKLIST } from '@/lib/onboarding/checklist';
import { GUIDES, guideForTrack } from '@/lib/onboarding/guides';
import {
  ONBOARDING_STAGES, STAGE_INFO, TRACK_LABEL, TRACKS_WRITTEN,
  mayTick, stepAppliesTo, stepDone, summarize, type OnboardingStage,
} from '@/types/onboarding';

/**
 * My journey: the new hire's own 90 days, in order. The whole programme is
 * shown — everybody's steps, not only theirs — because knowing that HR is
 * setting up your accounts this week and your team lead will review month
 * one is half of feeling looked after. "Only mine" narrows it.
 */
export default function JourneyPage() {
  const { data, loading, error, today, tick, busy } = useOnboarding();
  const bi = useBi();
  const [onlyMine, setOnlyMine] = useState(false);
  const [openStage, setOpenStage] = useState<OnboardingStage | null>(null);

  const program = data?.program;
  const steps = useMemo(
    () => (program ? CHECKLIST.filter((s) => stepAppliesTo(s, program.track)) : []),
    [program],
  );
  const summary = program ? summarize(CHECKLIST, program, today) : null;
  const shownStage = openStage ?? summary?.stage ?? 'pre';

  if (loading) return <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />;
  if (!program || !summary) {
    return <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error || bi({ en: 'Your onboarding could not be loaded.', es: 'No se pudo cargar tu onboarding.' })}</p>;
  }

  const myGuides = GUIDES.filter((g) => guideForTrack(g, program.track));
  const guidesDone = myGuides.filter((g) => program.guides[g.id]).length;
  const nextUp = steps
    .filter((s) => s.owner === 'you' && !stepDone(s, program))
    .sort((a, b) => ONBOARDING_STAGES.indexOf(a.stage) - ONBOARDING_STAGES.indexOf(b.stage) || a.order - b.order)
    .slice(0, 3);
  const firstName = data.name.split(' ')[0];
  const viewer = { self: true, manages: data.manages, leadsThem: false };
  const written = TRACKS_WRITTEN.includes(program.track);

  return (
    <div className="space-y-6 pb-16">
      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      {/* Welcome */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-indigo-600 p-6 text-white shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-white/5" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="text-sm font-medium text-white/70">{bi(TRACK_LABEL[program.track])} · {summary.day ? bi({ en: `Day ${summary.day} of 90`, es: `Día ${summary.day} de 90` }) : bi({ en: 'Before your first day', es: 'Antes de tu primer día' })}</p>
            <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{bi({ en: `Welcome, ${firstName}`, es: `Te damos la bienvenida, ${firstName}` })}</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/85">
              {bi({ en: 'Your first 90 days at Total Transport Logistics, step by step. Every guide, every task and every person who helps you is here. Come back any time — this is also where the answers to "how do I…?" live.', es: 'Tus primeros 90 días en Total Transport Logistics, paso a paso. Cada guía, cada tarea y cada persona que te ayuda está aquí. Regresa cuando quieras — aquí también están las respuestas a "¿cómo hago…?".' })}
            </p>
            {program.mentorName && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium"><Handshake size={13} /> {bi({ en: 'Your mentor', es: 'Tu mentor' })}: {program.mentorName}</p>
            )}
          </div>
          <div className="flex items-center gap-5 rounded-2xl bg-white p-4 text-gray-900 shadow-md">
            <ProgressRing percent={summary.percent} label={bi({ en: 'complete', es: 'completo' })} />
            <div className="space-y-1.5 text-sm">
              <p className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-green-600" /> {summary.done}/{summary.total} {bi({ en: 'steps', es: 'pasos' })}</p>
              <p className="flex items-center gap-1.5"><BookOpen size={15} className="text-brand-600" /> {guidesDone}/{myGuides.length} {bi({ en: 'guides', es: 'guías' })}</p>
              {summary.behind > 0 && <p className="flex items-center gap-1.5 text-amber-700"><AlertTriangle size={15} /> {summary.behind} {bi({ en: 'behind', es: 'atrasados' })}</p>}
            </div>
          </div>
        </div>
      </section>

      {!written && (
        <p className="flex gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Info size={16} className="mt-0.5 flex-shrink-0" />
          <span><T v={{ en: `The ${TRACK_LABEL[program.track].en} part of onboarding is still being written. For now you have the steps every new person at TTL does, and every guide is open to you.`, es: `La parte de ${TRACK_LABEL[program.track].es} del onboarding todavía se está escribiendo. Por ahora tienes los pasos que hace toda persona nueva en TTL, y todas las guías están abiertas para ti.` }} /></span>
        </p>
      )}

      {/* What to do next */}
      {nextUp.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-gray-900"><Sparkles size={18} className="text-amber-500" /> {bi({ en: 'Your next steps', es: 'Tus siguientes pasos' })}</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {nextUp.map((s) => (
              <Link
                key={s.id}
                href={s.guide ? `/dashboard/onboarding/learn/${s.guide}` : s.survey ? '/dashboard/onboarding/surveys' : s.href ?? '#checklist'}
                className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
              >
                <span className="text-xs font-medium text-brand-700">{bi(s.when)}</span>
                <span className="mt-1 flex-1 text-sm font-semibold text-gray-900"><T v={s.title} /></span>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-700">
                  {s.guide ? bi({ en: 'Open the guide', es: 'Abrir la guía' }) : bi({ en: 'Start', es: 'Empezar' })}
                  <ArrowRight size={13} className="transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* The four stages */}
      <section id="checklist" className="scroll-mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900"><Flag size={18} className="text-brand-600" /> {bi({ en: 'Your 90 days', es: 'Tus 90 días' })}</h2>
          <label className="inline-flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="rounded border-gray-300" />
            {bi({ en: 'Only the steps I do', es: 'Solo los pasos que hago yo' })}
          </label>
        </div>

        <ol className="grid gap-2 sm:grid-cols-4">
          {ONBOARDING_STAGES.map((st, i) => {
            const inStage = steps.filter((s) => s.stage === st);
            const doneN = inStage.filter((s) => stepDone(s, program)).length;
            const isNow = summary.stage === st;
            const past = ONBOARDING_STAGES.indexOf(summary.stage) > i;
            const shown = shownStage === st;
            return (
              <li key={st}>
                <button
                  type="button"
                  onClick={() => setOpenStage(st)}
                  className={`relative w-full rounded-2xl border p-3 text-left transition ${
                    shown ? 'border-brand-400 bg-brand-50 shadow-sm' : 'border-gray-200 bg-white hover:border-brand-200'
                  }`}
                >
                  <span className="flex items-center justify-between">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                      doneN === inStage.length && inStage.length ? 'bg-green-600 text-white' : isNow ? 'bg-brand-600 text-white' : past ? 'bg-amber-400 text-gray-900' : 'bg-gray-200 text-gray-600'
                    }`}>{doneN === inStage.length && inStage.length ? '✓' : i + 1}</span>
                    {isNow && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">{bi({ en: 'Now', es: 'Ahora' })}</span>}
                  </span>
                  <span className="mt-2 block text-sm font-semibold text-gray-900">{bi(STAGE_INFO[st].title)}</span>
                  <span className="block text-xs text-gray-500">{bi(STAGE_INFO[st].when)}</span>
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-gray-200">
                    <span className="block h-full rounded-full bg-brand-500 transition-all" style={{ width: `${inStage.length ? (doneN / inStage.length) * 100 : 0}%` }} />
                  </span>
                  <span className="mt-1 block text-[11px] text-gray-500">{doneN}/{inStage.length}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 className="text-base font-bold text-gray-900">{bi(STAGE_INFO[shownStage].title)} <span className="font-normal text-gray-400">· {bi(STAGE_INFO[shownStage].when)}</span></h3>
          <p className="mt-1 text-sm text-gray-600"><T v={STAGE_INFO[shownStage].goal} /></p>
          <ul className="mt-4 space-y-2">
            {steps
              .filter((s) => s.stage === shownStage && (!onlyMine || s.owner === 'you'))
              .sort((a, b) => a.order - b.order)
              .map((s) => (
                <StepRow
                  key={s.id}
                  step={s}
                  program={program}
                  canTick={mayTick(s, viewer)}
                  busy={busy}
                  onToggle={(done) => { void tick(s.id, done).catch(() => {}); }}
                />
              ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
