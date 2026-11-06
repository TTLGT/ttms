'use client';

import Link from 'next/link';
import { ArrowUpRight, BookOpen, CheckCircle2, Circle, ClipboardCheck, Lock } from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { T, useBi } from './T';
import {
  DEPARTMENT_LABEL, DEPARTMENT_TONE, stepDone,
  type ChecklistStep, type OnboardingProgram,
} from '@/types/onboarding';

/**
 * One line of the 90-day checklist. Drawn the same on the new hire's own
 * Journey and on the person page a trainer or team lead opens; `canTick`
 * is worked out by the caller with `mayTick()`, and the server checks again.
 */
export default function StepRow({ step, program, canTick, onToggle, busy, showWho = true }: {
  step: ChecklistStep;
  program: OnboardingProgram;
  canTick: boolean;
  onToggle: (done: boolean) => void;
  busy: boolean;
  showWho?: boolean;
}) {
  const { formatDate } = useDateFormatters();
  const bi = useBi();
  const done = stepDone(step, program);
  const mark = program.done[step.id];
  // A step ticked by a guide or a survey is finished by doing that thing, so
  // its box is not a toggle — unticking it would only be put back.
  const auto = !mark && done;
  const toggle = canTick && !auto;

  return (
    <li className={`group flex gap-3 rounded-xl border px-3 py-2.5 transition ${done ? 'border-green-200 bg-green-50/60' : 'border-gray-200 bg-white hover:border-brand-200'}`}>
      <button
        type="button"
        disabled={!toggle || busy}
        onClick={() => onToggle(!done)}
        title={toggle ? (done ? bi({ en: 'Mark as not done', es: 'Marcar como no hecho' }) : bi({ en: 'Mark as done', es: 'Marcar como hecho' }))
          : step.owner === 'you' ? '' : bi({ en: 'Ticked by the department that does it', es: 'Lo marca el departamento que lo hace' })}
        className="mt-0.5 flex-shrink-0 disabled:cursor-default"
      >
        {done
          ? <CheckCircle2 size={22} className="text-green-600" />
          : toggle ? <Circle size={22} className="text-gray-300 group-hover:text-brand-500" />
          : <Lock size={18} className="m-0.5 text-gray-300" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`text-sm font-medium ${done ? 'text-gray-600' : 'text-gray-900'}`}><T v={step.title} /></span>
        </div>
        {step.detail && <p className="mt-0.5 text-xs text-gray-500"><T v={step.detail} /></p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">{bi(step.when)}</span>
          {showWho && (
            <span className={`rounded-full border px-2 py-0.5 font-medium ${DEPARTMENT_TONE[step.owner]}`}>{bi(DEPARTMENT_LABEL[step.owner])}</span>
          )}
          {step.guide && (
            <Link href={`/dashboard/onboarding/learn/${step.guide}`} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700 hover:bg-brand-100">
              <BookOpen size={11} /> {bi({ en: 'Open the guide', es: 'Abrir la guía' })}
            </Link>
          )}
          {step.survey && (
            <Link href="/dashboard/onboarding/surveys" className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700 hover:bg-brand-100">
              <ClipboardCheck size={11} /> {bi({ en: 'Open the survey', es: 'Abrir la encuesta' })}
            </Link>
          )}
          {step.href && !step.guide && !step.survey && (
            <Link href={step.href} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700 hover:bg-gray-200">
              <ArrowUpRight size={11} /> {bi({ en: 'Go there', es: 'Ir ahí' })}
            </Link>
          )}
          {mark && (
            <span className="text-gray-400">
              {mark.byName ? `${mark.byName} · ` : ''}{formatDate(mark.at)}{mark.note ? ` · “${mark.note}”` : ''}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
