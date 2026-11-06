'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, CheckCircle2, ClipboardCheck, Lock, Save } from 'lucide-react';
import DateField from '@/components/DateField';
import { UserAvatar } from '@/components/settings/UserAvatar';
import ProgressRing from '@/components/onboarding/ProgressRing';
import StepRow from '@/components/onboarding/StepRow';
import { T, useBi } from '@/components/onboarding/T';
import { getOnboardingPerson, patchOnboardingPerson, type PersonDetail } from '@/lib/onboarding/client';
import { CHECKLIST } from '@/lib/onboarding/checklist';
import { GUIDES, guideForTrack } from '@/lib/onboarding/guides';
import { RATING_LABELS, SURVEYS } from '@/lib/onboarding/surveys';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  DEPARTMENTS, DEPARTMENT_LABEL, ONBOARDING_STAGES, ONBOARDING_TRACKS, STAGE_INFO, TRACK_LABEL,
  mayTick, stepAppliesTo, type Department, type OnboardingTrack,
} from '@/types/onboarding';

/**
 * One person's programme, for whoever runs onboarding or leads their team.
 * The trainer, HR, dispatch and the admin assistant tick their department's
 * steps here; `mayTick()` decides what is a button, and the route decides
 * again.
 */
export default function PersonOnboardingPage({ params }: { params: Promise<{ email: string }> }) {
  const { email: raw } = use(params);
  const email = decodeURIComponent(raw);
  const bi = useBi();
  const { formatDate } = useDateFormatters();
  const [d, setD] = useState<PersonDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dept, setDept] = useState<Department | 'all'>('all');
  const [track, setTrack] = useState<OnboardingTrack>('broker');
  const [start, setStart] = useState('');
  const [mentor, setMentor] = useState('');

  function load(next: PersonDetail) {
    setD(next);
    setTrack(next.program.track);
    setStart(next.program.startDate ?? '');
    setMentor(next.program.mentorName ?? '');
  }

  useEffect(() => {
    getOnboardingPerson(email).then(load).catch((e: Error) => setError(e.message));
  }, [email]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true); setError('');
    try { load(await patchOnboardingPerson(email, body)); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  if (error && !d) return <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;
  if (!d) return <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />;

  const { person, program, summary, viewer } = d;
  const steps = CHECKLIST.filter((s) => stepAppliesTo(s, program.track));
  const guides = GUIDES.filter((g) => guideForTrack(g, program.track));
  const dirty = track !== program.track || (start || null) !== program.startDate || (mentor.trim() || null) !== program.mentorName;

  return (
    <div className="space-y-5 pb-16">
      <Link href="/dashboard/onboarding/team" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-700"><ArrowLeft size={14} /> {bi({ en: 'Team progress', es: 'Avance del equipo' })}</Link>

      <section className="flex flex-wrap items-center gap-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <UserAvatar photoPath={person.photoPath} fallback={person.name[0] ?? '?'} size={56} name={person.name} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{person.name}</h1>
          <p className="text-sm text-gray-500">{bi(TRACK_LABEL[program.track])}{person.teamName ? ` · ${person.teamName}` : ''} · {bi(STAGE_INFO[summary.stage].title)}{summary.day ? ` · ${bi({ en: `day ${Math.min(summary.day, 90)} of 90`, es: `día ${Math.min(summary.day, 90)} de 90` })}` : ''}</p>
          {program.mentorName && <p className="mt-1 text-sm text-gray-600">{bi({ en: 'Mentor', es: 'Mentor' })}: {program.mentorName}</p>}
        </div>
        <ProgressRing percent={summary.percent} size={84} label={`${summary.done}/${summary.total}`} />
      </section>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      {viewer.manages && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-gray-900">{bi({ en: 'Programme', es: 'Programa' })}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="text-xs font-medium text-gray-500">{bi({ en: 'Track', es: 'Ruta' })}</span>
              <select value={track} onChange={(e) => setTrack(e.target.value as OnboardingTrack)} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                {ONBOARDING_TRACKS.map((t) => <option key={t} value={t}>{bi(TRACK_LABEL[t])}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-xs font-medium text-gray-500">{bi({ en: 'First day of training', es: 'Primer día de training' })}</span>
              <DateField value={start} onChange={setStart} className="mt-1 w-full" ariaLabel="First day of training" />
            </label>
            <label className="text-sm">
              <span className="text-xs font-medium text-gray-500">{bi({ en: 'Experienced broker (mentor)', es: 'Broker experimentado (mentor)' })}</span>
              <input value={mentor} onChange={(e) => setMentor(e.target.value)} maxLength={80} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
          </div>
          <button type="button" disabled={!dirty || busy}
            onClick={() => void patch({ action: 'setup', track, startDate: start || null, mentorName: mentor.trim() || null })}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
            <Save size={14} /> {bi({ en: 'Save', es: 'Guardar' })}
          </button>
        </section>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-gray-900">{bi({ en: 'Checklist', es: 'Lista de pasos' })}</h2>
          <select value={dept} onChange={(e) => setDept(e.target.value as Department | 'all')} className="rounded-lg border border-gray-300 px-2 py-1 text-sm">
            <option value="all">{bi({ en: 'Every department', es: 'Todos los departamentos' })}</option>
            {DEPARTMENTS.map((x) => <option key={x} value={x}>{bi(DEPARTMENT_LABEL[x])}</option>)}
          </select>
        </div>
        {ONBOARDING_STAGES.map((st) => {
          const list = steps.filter((s) => s.stage === st && (dept === 'all' || s.owner === dept)).sort((a, b) => a.order - b.order);
          if (!list.length) return null;
          return (
            <div key={st} className="mt-5">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">{bi(STAGE_INFO[st].title)} <span className="font-normal text-gray-400">· {bi(STAGE_INFO[st].when)}</span></h3>
              <ul className="space-y-2">
                {list.map((s) => (
                  <StepRow key={s.id} step={s} program={program} busy={busy} canTick={mayTick(s, viewer)}
                    onToggle={(done) => void patch({ action: done ? 'tick' : 'untick', stepId: s.id })} />
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-base font-bold text-gray-900"><BookOpen size={17} className="text-brand-600" /> {bi({ en: 'Guides', es: 'Guías' })}</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {guides.map((g) => {
            const m = program.guides[g.id];
            return (
              <li key={g.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${m ? 'border-green-200 bg-green-50/60' : 'border-gray-200'}`}>
                {m ? <CheckCircle2 size={16} className="text-green-600" /> : <span className="h-4 w-4 rounded-full border-2 border-gray-300" />}
                <span className="flex-1 text-gray-800">{bi(g.title)}</span>
                {m && <span className="text-xs text-gray-500">{m.score !== undefined && m.total ? `${m.score}/${m.total} · ` : ''}{formatDate(m.at)}</span>}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-base font-bold text-gray-900"><ClipboardCheck size={17} className="text-brand-600" /> {bi({ en: 'Surveys', es: 'Encuestas' })}</h2>
        {!program.surveys ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-500">
            <Lock size={14} />
            {program.surveysSubmitted.length
              ? bi({ en: `${program.surveysSubmitted.length} sent. Only HR reads the answers.`, es: `${program.surveysSubmitted.length} enviadas. Solo RR. HH. lee las respuestas.` })
              : bi({ en: 'None sent yet. Only HR reads the answers.', es: 'Ninguna enviada aún. Solo RR. HH. lee las respuestas.' })}
          </p>
        ) : SURVEYS.map((s) => {
          const a = program.surveys?.[s.id];
          return (
            <div key={s.id} className="mt-4">
              <h3 className="text-sm font-semibold text-gray-800">{bi(s.title)} {a ? <span className="font-normal text-gray-400">· {formatDate(a.submittedAt)}</span> : <span className="font-normal text-gray-400">· {bi({ en: 'not sent', es: 'no enviada' })}</span>}</h3>
              {a && (
                <dl className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-200">
                  {s.sections.flatMap((sec) => sec.questions).filter((q) => a.answers[q.id] !== undefined).map((q) => {
                    const v = a.answers[q.id];
                    return (
                      <div key={q.id} className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:gap-4">
                        <dt className="flex-1 text-sm text-gray-600"><T v={q.text} /></dt>
                        <dd className="text-sm font-medium text-gray-900 sm:w-1/2">
                          {typeof v === 'number' ? <span className="inline-flex items-center gap-2"><span className="rounded-md bg-brand-50 px-2 py-0.5 font-bold text-brand-700">{v}/5</span>{bi(RATING_LABELS[v - 1])}</span> : <span className="whitespace-pre-wrap">{v}</span>}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
