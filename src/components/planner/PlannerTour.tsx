'use client';

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A guided tour on the real screen: it dims the page, lights one thing at a
 * time, and says what it does — English with the Spanish underneath, as the
 * onboarding guides are written, whether or not the Spanish switch is on.
 *
 * Built into TTMS rather than an outside tour service, so nothing outside the
 * company ever sees a screen. It never changes the page: each step names an
 * element by its `data-tour` attribute and is drawn over it, and a step whose
 * element is not on screen (a card that only shows for some people) is
 * skipped rather than pointing at nothing.
 *
 * Skipping is an answer as much as finishing — see recordTour() — so a tour
 * that was dismissed does not come back every visit.
 */

export interface TourStep {
  /** The `data-tour` value of the element to light up. */
  target: string;
  title: string;
  text: string;
  es: { title: string; text: string };
}

const PAD = 8;

export default function PlannerTour({ steps, label, onClose }: {
  steps: TourStep[];
  /** Which tab, for the counter: "2 of 5 · Today". */
  label: string;
  /**
   * How it ended: `finished` (Done on the last step), `skipped`, or
   * `nothing` — no step's element ever appeared, so nobody saw a tour and it
   * must not be recorded as seen.
   */
  onClose: (how: 'finished' | 'skipped' | 'nothing') => void;
}) {
  // Only the steps whose element exists, worked out once the page has drawn.
  const [shown, setShown] = useState<TourStep[] | null>(null);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // The tab may still be loading its list when the tour is asked for, so look
  // for the elements for a few seconds before deciding there is nothing to show.
  useEffect(() => {
    let tries = 0;
    const look = () => {
      const found = steps.filter((s) => document.querySelector(`[data-tour="${s.target}"]`));
      if (found.length > 0 || tries >= 40) { setShown(found); return; }
      tries += 1;
      timer = window.setTimeout(look, 150);
    };
    let timer = window.setTimeout(look, 0);
    return () => window.clearTimeout(timer);
  }, [steps]);

  const step = shown?.[i] ?? null;

  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  useLayoutEffect(() => {
    if (!step) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    measure();
    // The smooth scroll moves it after the first measure; measure again as it settles.
    const t1 = window.setTimeout(measure, 250);
    const t2 = window.setTimeout(measure, 600);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [step, measure]);

  useEffect(() => {
    // The dashboard scrolls inside its main column, not the window: capture catches both.
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose('skipped');
      if (e.key === 'ArrowRight' && shown && i < shown.length - 1) setI(i + 1);
      if (e.key === 'ArrowLeft' && i > 0) setI(i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [i, shown, onClose]);

  useEffect(() => {
    if (shown && shown.length === 0) onClose('nothing');
  }, [shown, onClose]);

  if (!shown || !step || typeof document === 'undefined') return null;

  const last = i === shown.length - 1;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const cardW = Math.min(360, vw - 32);
  // Below the element when there is room, else above it, else pinned to the bottom.
  let top = vh - 260;
  let left = 16;
  if (rect) {
    left = Math.min(Math.max(16, rect.left), vw - cardW - 16);
    if (rect.bottom + PAD + 230 < vh) top = rect.bottom + PAD + 10;
    else if (rect.top - PAD - 230 > 0) top = rect.top - PAD - 230;
  }

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={`${label} tour`}>
      {/* The dimming is the spotlight's own shadow, so the lit element is untouched and still readable. */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-amber-400 transition-all duration-200"
          style={{
            top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(6,12,28,.58)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(6,12,28,.58)]" />
      )}
      {/* Clicks outside the card do nothing: a tour that closes on a stray click is lost for good. */}
      <div className="absolute inset-0" />
      <div
        className="absolute rounded-xl bg-white p-4 shadow-2xl"
        style={{ top, left, width: cardW }}
        data-learn-skip
      >
        <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
          {i + 1} of {shown.length} · {label}
        </p>
        <p className="mt-1 text-base font-semibold text-gray-900">{step.title}</p>
        <p className="mt-1 text-sm text-gray-600">{step.text}</p>
        <p className="mt-2 text-sm italic text-teal-700" lang="es">
          <span className="font-semibold">{step.es.title}.</span> {step.es.text}
        </p>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={() => onClose('skipped')} className="text-sm text-gray-500 underline hover:text-gray-700">
            Skip tour
          </button>
          <span className="flex-1" />
          {i > 0 && (
            <button type="button" onClick={() => setI(i - 1)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Back
            </button>
          )}
          <button type="button" autoFocus onClick={() => (last ? onClose('finished') : setI(i + 1))}
            className="rounded-lg bg-brand-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-brand-700">
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The Today tab's tour. Targets are `data-tour` attributes in TodayTab.tsx. */
export const TODAY_TOUR: TourStep[] = [
  {
    target: 'glance',
    title: 'Your day at a glance',
    text: 'How much of Today’s 3 is done, what is due today, what is late, and how many meetings you have.',
    es: { title: 'Tu día de un vistazo', text: 'Cuánto de tus 3 de hoy está hecho, qué vence hoy, qué está atrasado y cuántas reuniones tienes.' },
  },
  {
    target: 'today3',
    title: 'Today’s 3',
    text: 'The three things that matter most today. Pick them first thing and finish them first. Tick one off and it stays here, done.',
    es: { title: 'Tus 3 de hoy', text: 'Las tres cosas más importantes de hoy. Elígelas temprano y termínalas primero. Al marcarlas quedan aquí como hechas.' },
  },
  {
    target: 'timeline',
    title: 'The timeline',
    text: 'Your working hours with every meeting and timed task on them, and a red line for now. Anything with a time shows up here by itself.',
    es: { title: 'La línea del tiempo', text: 'Tu horario con cada reunión y tarea con hora, y una línea roja para ahora. Todo lo que tenga hora aparece aquí solo.' },
  },
  {
    target: 'quick-add',
    title: 'Quick add',
    text: 'Type a task the way you would say it: “Call Rio Grande tomorrow 3pm !urgent #10511 @Ana”. Dates, times, urgent, a load and a colleague are picked out for you, in English or Spanish.',
    es: { title: 'Agregar rápido', text: 'Escribe la tarea como la dirías: “Llamar a Rio Grande mañana a las 3 !urgente #10511 @Ana”. Fecha, hora, urgente, carga y compañero se reconocen solos.' },
  },
  {
    target: 'inbox',
    title: 'The inbox',
    text: 'Tasks with no day yet. Give each one a day, or put it in Today’s 3, so nothing you wrote down gets lost.',
    es: { title: 'La bandeja', text: 'Tareas que todavía no tienen día. Dale un día a cada una, o ponla en tus 3 de hoy, para que nada se pierda.' },
  },
];

/**
 * The planning pop-up's tour, shown the first time it opens. Targets are
 * `data-tour` attributes in PlanningPopup.tsx; a step whose element is not
 * drawn (snoozing, once the snoozes are used up) is skipped by itself.
 */
export const POPUP_TOUR: TourStep[] = [
  {
    target: 'popup-suggested',
    title: 'A plan, ready to accept',
    text: 'Three things picked from your list and from what is waiting on you in TTMS: unsigned SAs, loads moving today, quotes with no answer, clients gone quiet. Use them as they are, or pick your own below.',
    es: { title: 'Un plan listo para aceptar', text: 'Tres cosas elegidas de tu lista y de lo que te espera en TTMS: SA sin firmar, cargas que se mueven hoy, cotizaciones sin respuesta, clientes que se enfriaron. Úsalas tal cual o elige las tuyas abajo.' },
  },
  {
    target: 'popup-full',
    title: 'Plan my whole day',
    text: 'A few questions that catch what is not on your list yet, then a time for each of your 3 around your meetings.',
    es: { title: 'Planear todo mi día', text: 'Unas preguntas que encuentran lo que todavía no está en tu lista, y luego una hora para cada una de tus 3 alrededor de tus reuniones.' },
  },
  {
    target: 'popup-snooze',
    title: 'Putting it off',
    text: 'You can put it off twice: 15 minutes, then 5. After that, plan just one thing to get back to work. Planning takes about a minute.',
    es: { title: 'Posponer', text: 'Puedes posponerlo dos veces: 15 minutos y luego 5. Después, planea solo una cosa para volver al trabajo. Planear toma como un minuto.' },
  },
];
