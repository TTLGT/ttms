'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronRight, Search, Users } from 'lucide-react';
import { UserAvatar } from '@/components/settings/UserAvatar';
import { useOnboarding } from '@/components/onboarding/OnboardingProvider';
import { useBi } from '@/components/onboarding/T';
import { listOnboardingPeople, type PersonRow } from '@/lib/onboarding/client';
import { GUIDES, guideForTrack } from '@/lib/onboarding/guides';
import { STAGE_INFO, TRACK_LABEL, daysBetween } from '@/types/onboarding';

/**
 * Everybody's onboarding at a glance — the company for `onboarding.manage`,
 * the team for a Sales Manager. The route decides who is in the list; this
 * page only sorts and filters what came back.
 */

type Filter = 'active' | 'all';

/** Somebody HR has started a programme for, or who began in the last 120 days. */
function inOnboarding(r: PersonRow, today: string): boolean {
  if (r.program.stored) return !r.program.startDate || daysBetween(r.program.startDate, today) <= 120;
  return !!r.program.startDate && daysBetween(r.program.startDate, today) <= 120;
}

export default function TeamProgressPage() {
  const { data, today } = useOnboarding();
  const bi = useBi();
  const [rows, setRows] = useState<PersonRow[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('active');

  useEffect(() => {
    listOnboardingPeople().then((r) => setRows(r.people)).catch((e: Error) => setError(e.message));
  }, []);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? [])
      .filter((r) => filter === 'all' || inOnboarding(r, today))
      .filter((r) => !s || r.person.name.toLowerCase().includes(s) || (r.person.teamName ?? '').toLowerCase().includes(s))
      .sort((a, b) => b.summary.behind - a.summary.behind || a.person.name.localeCompare(b.person.name));
  }, [rows, q, filter, today]);

  if (data && !data.manages && !data.leadsTeam) {
    return <p className="text-sm text-gray-500">{bi({ en: 'This view is for HR, the trainer and team leads.', es: 'Esta vista es para RR. HH., el trainer y los líderes de equipo.' })}</p>;
  }

  return (
    <div className="space-y-4 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><Users size={22} className="text-brand-600" /> {bi({ en: 'Team progress', es: 'Avance del equipo' })}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {data?.manages
              ? bi({ en: 'Everybody’s onboarding. Open a person to tick the steps your department does, or to set their track, start date and mentor.', es: 'El onboarding de todos. Abre a una persona para marcar los pasos de tu departamento, o poner su ruta, fecha de inicio y mentor.' })
              : bi({ en: 'Your team’s onboarding. Open a person to tick the team-lead and mentor steps.', es: 'El onboarding de tu equipo. Abre a una persona para marcar los pasos de líder y mentor.' })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-gray-200 text-sm">
            {(['active', 'all'] as Filter[]).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)} className={`px-3 py-1.5 ${filter === f ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {f === 'active' ? bi({ en: 'In onboarding', es: 'En onboarding' }) : bi({ en: 'Everyone', es: 'Todos' })}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={bi({ en: 'Find a person or team', es: 'Buscar persona o equipo' })} className="rounded-lg border border-gray-300 py-1.5 pl-8 pr-3 text-sm" />
          </div>
        </div>
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {!rows && !error && <div className="h-40 animate-pulse rounded-2xl bg-gray-100" />}
      {rows && shown.length === 0 && (
        <p className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          {filter === 'active'
            ? bi({ en: 'Nobody is in onboarding right now. Set a start date on someone (open them from Everyone) to start their 90 days.', es: 'Nadie está en onboarding ahora. Pon una fecha de inicio a alguien (ábrelo desde Todos) para empezar sus 90 días.' })
            : bi({ en: 'Nobody matches that.', es: 'Nadie coincide.' })}
        </p>
      )}

      {shown.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <ul className="divide-y divide-gray-100">
            {shown.map((r) => {
              const guides = GUIDES.filter((g) => guideForTrack(g, r.program.track));
              const gDone = guides.filter((g) => r.program.guides[g.id]).length;
              return (
                <li key={r.person.email}>
                  <Link href={`/dashboard/onboarding/team/${encodeURIComponent(r.person.email)}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-gray-50 sm:flex-nowrap">
                    <UserAvatar photoPath={r.person.photoPath} fallback={r.person.name[0] ?? '?'} size={36} name={r.person.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900">{r.person.name}</p>
                      <p className="truncate text-xs text-gray-500">{bi(TRACK_LABEL[r.program.track])}{r.person.teamName ? ` · ${r.person.teamName}` : ''}</p>
                    </div>
                    <div className="w-32 text-xs text-gray-500">
                      <p className="font-medium text-gray-700">{bi(STAGE_INFO[r.summary.stage].title)}</p>
                      <p>{r.summary.day ? bi({ en: `Day ${Math.min(r.summary.day, 90)} of 90`, es: `Día ${Math.min(r.summary.day, 90)} de 90` }) : r.program.startDate ? bi({ en: 'Not started', es: 'Sin empezar' }) : bi({ en: 'No start date', es: 'Sin fecha de inicio' })}</p>
                    </div>
                    <div className="w-40">
                      <div className="flex justify-between text-[11px] text-gray-500"><span>{r.summary.done}/{r.summary.total}</span><span>{r.summary.percent}%</span></div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-200"><div className="h-full rounded-full bg-brand-500" style={{ width: `${r.summary.percent}%` }} /></div>
                      <p className="mt-1 text-[11px] text-gray-500">{gDone}/{guides.length} {bi({ en: 'guides', es: 'guías' })}</p>
                    </div>
                    <div className="w-24 text-right">
                      {r.summary.behind > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800"><AlertTriangle size={11} /> {r.summary.behind} {bi({ en: 'behind', es: 'atrasados' })}</span>
                      )}
                    </div>
                    <ChevronRight size={16} className="hidden text-gray-300 sm:block" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
