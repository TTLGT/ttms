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
    // Brokers and Sales Managers only: the step is skipped where the card is not drawn.
    target: 'targets',
    title: 'Today’s targets',
    text: 'Your calls, emails and referrals: tap +1 as you go, here or on the Calls button at the bottom of any page. Quotes and new clients count themselves. Your Sales Manager sets the usual numbers; change today’s in the planning pop-up.',
    es: { title: 'Metas de hoy', text: 'Tus llamadas, correos y referidos: toca +1 mientras avanzas, aquí o en el botón Llamadas abajo de cualquier página. Las cotizaciones y los clientes nuevos se cuentan solos. Tu gerente pone los números de siempre; cambia los de hoy en la ventana de planificación.' },
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

/**
 * The Clients → My leads tour (step 4b). Targets are `data-tour` attributes in
 * src/app/dashboard/clients/page.tsx and LeadsBoard.tsx. "Whose leads" only
 * shows for a Sales Manager or an admin, and "A lead" only once there is a
 * card, so each is skipped by itself where it is not drawn.
 */
export const LEADS_TOUR: TourStep[] = [
  {
    target: 'leads-tabs',
    title: 'Your leads, beside your clients',
    text: 'All clients is the usual list. My leads is every company you are working to win, from the day you find it to its first load.',
    es: { title: 'Tus prospectos, junto a tus clientes', text: 'Todos los clientes es la lista de siempre. Mis prospectos son todas las empresas que estás tratando de ganar, desde el día en que las encuentras hasta su primera carga.' },
  },
  {
    target: 'leads-add',
    title: 'Add a lead',
    text: 'The new-client form, with one difference: the client goes straight onto this board. A lead is a client record from the first day, so nothing has to be typed again when it books.',
    es: { title: 'Agregar un prospecto', text: 'El formulario de cliente nuevo, con una diferencia: el cliente entra directo a este tablero. Un prospecto es un registro de cliente desde el primer día, así que no hay que escribir nada otra vez cuando reserva.' },
  },
  {
    target: 'leads-board',
    title: 'Found, Contacted, Quoted, First load',
    text: 'Drag a card to another column, or use its arrows. Some moves happen by themselves: logging a call moves a found lead to Contacted, a load created for it moves it to Quoted, and its first booked load to First load.',
    es: { title: 'Encontrado, Contactado, Cotizado, Primera carga', text: 'Arrastra una tarjeta a otra columna o usa sus flechas. Algunos cambios pasan solos: registrar una llamada mueve un prospecto encontrado a Contactado, una carga creada para él lo mueve a Cotizado, y su primera carga reservada a Primera carga.' },
  },
  {
    target: 'leads-card',
    title: 'A lead',
    text: 'Its next step and when. Open it to log a call or an email under Sales activity: each one also counts on your today’s targets, and a next step due today shows up in your morning planning pop-up.',
    es: { title: 'Un prospecto', text: 'Su siguiente paso y cuándo. Ábrelo para registrar una llamada o un correo en Actividad de ventas: cada uno también cuenta en tus metas de hoy, y un siguiente paso que vence hoy aparece en tu ventana de planificación de la mañana.' },
  },
  {
    target: 'leads-whose',
    title: 'Your team’s leads',
    text: 'As a Sales Manager or an admin, pick somebody here to see their board.',
    es: { title: 'Los prospectos de tu equipo', text: 'Como Sales Manager o administrador, elige a alguien aquí para ver su tablero.' },
  },
  {
    target: 'leads-privacy',
    title: 'Who sees this',
    text: 'Only you, your Sales Manager and admins. Colleagues who can open a client still do not see its calls, emails or stage.',
    es: { title: 'Quién ve esto', text: 'Solo tú, tu Sales Manager y los administradores. Los compañeros que pueden abrir un cliente igual no ven sus llamadas, correos ni etapa.' },
  },
];

/**
 * The Tasks tab's tour (step 5). Targets are `data-tour` attributes in
 * TasksTab.tsx, TaskList.tsx and QuickAdd.tsx. "A task" is skipped while the
 * list is empty; on the Path (game mode) the list step lights the road.
 */
export const TASKS_TOUR: TourStep[] = [
  {
    target: 'tasks-add',
    title: 'One box for every view',
    text: 'Type a task the way you would say it, the same as on Today: “Send rates to Sunbelt Friday !urgent #10533”. Add with details opens the full editor.',
    es: { title: 'Una caja para todas las vistas', text: 'Escribe la tarea como la dirías, igual que en Hoy: “Send rates to Sunbelt Friday !urgent #10533”. Agregar con detalles abre el editor completo.' },
  },
  {
    target: 'tasks-views',
    title: 'Four views',
    text: 'List, Board, Sticky notes and Table: the same tasks, four ways. TTMS remembers the one you used last.',
    es: { title: 'Cuatro vistas', text: 'Lista, Tablero, Notas adhesivas y Tabla: las mismas tareas, de cuatro formas. TTMS recuerda la última que usaste.' },
  },
  {
    target: 'tasks-filter',
    title: 'One filter',
    text: 'Type a word, a name or a load number to narrow every view at once. The colour chips below filter by tag.',
    es: { title: 'Un filtro', text: 'Escribe una palabra, un nombre o un número de carga para filtrar todas las vistas a la vez. Las etiquetas de color de abajo filtran por color.' },
  },
  {
    target: 'tasks-list',
    title: 'Your order',
    text: 'Drag a task up or down to put it where it belongs, or use its arrows. A red flag means Urgent. The chips say when you will work on it and when it is due.',
    es: { title: 'Tu orden', text: 'Arrastra una tarea hacia arriba o abajo para ponerla donde va, o usa sus flechas. Una bandera roja significa Urgente. Las etiquetas dicen cuándo trabajarás en ella y cuándo vence.' },
  },
  {
    target: 'tasks-row',
    title: 'Open a task',
    text: 'Click it to open the side panel: title, When, Deadline, Urgent and the steps up front. Reminders, repeats, notes, the load and the rest are under More.',
    es: { title: 'Abrir una tarea', text: 'Haz clic para abrir el panel lateral: título, Cuándo, Fecha límite, Urgente y los pasos al frente. Recordatorios, repeticiones, notas, la carga y lo demás están en Más.' },
  },
];

/**
 * The Calendar tab's tour (step 6). Targets are `data-tour` attributes in
 * CalendarScreen.tsx, ScheduleTray.tsx and TaskCalendar.tsx.
 */
export const CALENDAR_TOUR: TourStep[] = [
  {
    target: 'cal-tray',
    title: 'To schedule',
    text: 'Every open task with no time yet. Drag one onto a day, or onto an hour in Week view, to decide when you will do it.',
    es: { title: 'Por agendar', text: 'Cada tarea abierta que todavía no tiene hora. Arrastra una a un día, o a una hora en la vista Semana, para decidir cuándo la harás.' },
  },
  {
    target: 'cal-modes',
    title: 'Month, week or day',
    text: 'Switch how much you see. In Week, 4 days and Day you can drag things to another time and pull an event’s bottom edge to change how long it lasts.',
    es: { title: 'Mes, semana o día', text: 'Cambia cuánto ves. En Semana, 4 días y Día puedes arrastrar cosas a otra hora y jalar el borde de abajo de un evento para cambiar cuánto dura.' },
  },
  {
    target: 'cal-layers',
    title: 'Layers',
    text: 'Choose what is drawn: your tasks, your events, holidays in Guatemala and the US, and for admins and HR, birthdays and anniversaries.',
    es: { title: 'Capas', text: 'Elige qué se muestra: tus tareas, tus eventos, los feriados de Guatemala y EE. UU., y para administradores y RR. HH., cumpleaños y aniversarios.' },
  },
  {
    target: 'cal-day',
    title: 'The chosen day',
    text: 'Click any day to see everything on it here, and add to it.',
    es: { title: 'El día elegido', text: 'Haz clic en cualquier día para ver aquí todo lo que tiene, y agregarle cosas.' },
  },
  {
    target: 'cal-settings',
    title: 'Settings',
    text: 'How your reminders reach you, your planning times, the plan you shared, and for admins and HR the celebration reminders.',
    es: { title: 'Configuración', text: 'Cómo te llegan los recordatorios, tus horarios de planificación, el plan que compartiste y, para administradores y RR. HH., los recordatorios de celebraciones.' },
  },
];

/**
 * Game mode's tour (step 7), on the Tasks tab the first time game mode is on
 * there — after the Tasks tab's own tour, never over it. Targets are
 * `data-tour` attributes in TaskGame.tsx.
 */
export const GAME_TOUR: TourStep[] = [
  {
    target: 'game-bar',
    title: 'Your level and XP',
    text: 'Finishing tasks and steps earns XP, and so do planning your day in the pop-up, closing it, and, if you have daily targets, your calls, emails and referrals. Your streak grows with each working day you finish something. On the Today tab, your vehicle travels a stop for each of Today’s 3 you finish. Only you see any of this.',
    es: { title: 'Tu nivel y tu XP', text: 'Terminar tareas y pasos da XP, y también planear tu día en la ventana, cerrarlo y, si tienes metas diarias, tus llamadas, correos y referidos. Tu racha crece cada día laboral en que terminas algo. En la pestaña Hoy, tu vehículo avanza una parada por cada una de tus 3 de hoy que terminas. Solo tú ves esto.' },
  },
  {
    target: 'game-missions',
    title: 'Missions, rules and badges',
    text: 'Open this for today’s and this week’s missions, your recent XP, and the rules. Gentle is the default: nothing is ever taken away. Hard is for people who want it to cost something, and earns its own badges.',
    es: { title: 'Misiones, reglas e insignias', text: 'Ábrelo para ver las misiones de hoy y de la semana, tu XP reciente y las reglas. Suave es lo normal: nunca se quita nada. Difícil es para quien quiere que cueste algo, y gana sus propias insignias.' },
  },
  {
    target: 'game-theme',
    title: 'Your theme',
    text: 'Freight, wizarding, empires, fairy worlds, outer space or pirates: a truck, a broom, a carriage, a dragonfly, a rocket or a galleon on your Today scene. Level 5 unlocks an extra for it. A theme changes how things look and what the levels are called, never your XP or what the buttons say.',
    es: { title: 'Tu tema', text: 'Carga, magia, imperios, mundos de hadas, el espacio o piratas: un camión, una escoba, un carruaje, una libélula, un cohete o un galeón en tu escena de Hoy. El nivel 5 desbloquea un extra. El tema cambia cómo se ven las cosas y cómo se llaman los niveles, nunca tu XP ni lo que dicen los botones.' },
  },
];
