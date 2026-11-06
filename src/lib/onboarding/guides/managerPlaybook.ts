import { b, type Guide } from '../guideTypes';

export const MANAGER_PLAYBOOK_GUIDE: Guide = {
  id: 'manager-playbook',
  group: 'leadership',
  icon: 'users',
  title: b('The Sales Manager playbook', 'El manual del Gerente de ventas'),
  summary: b(
    'Leading a team of brokers: the team rhythm, one-to-ones, coaching calls, sales training, feedback, bringing new hires through their 90 days, and what TTMS lets you see and do for your team.',
    'Liderar un equipo de brokers: el ritmo del equipo, los uno a uno, el coaching de llamadas, la capacitación de ventas, la retroalimentación, acompañar a los nuevos en sus 90 días, y lo que TTMS te deja ver y hacer por tu equipo.',
  ),
  minutes: 30,
  tryHref: '/dashboard/calendar',
  tracks: ['salesManager'],
  sections: [
    {
      id: 'shift',
      title: b('Your job just changed', 'Tu trabajo acaba de cambiar'),
      points: [
        b('As a broker you were measured on your loads. As a manager you are measured on your team’s.', 'Como broker te medían por tus cargas. Como gerente te miden por las de tu equipo.'),
        b('Your best hour is no longer on the phone — it is helping three people each get better at the phone.', 'Tu mejor hora ya no es al teléfono — es ayudar a tres personas a ser mejores al teléfono.'),
        b('The most common mistake of a new manager: keep doing everyone’s hard loads. It feels helpful and teaches nobody.', 'El error más común de un gerente nuevo: seguir haciendo las cargas difíciles de todos. Se siente útil y no le enseña a nadie.'),
      ],
    },
    {
      id: 'powers',
      title: b('What TTMS gives you for your team', 'Lo que TTMS te da para tu equipo'),
      intro: b('A Sales Manager is a broker plus admin-level power over the people on the team they lead (Settings → Teams).', 'Un Gerente de ventas es un broker más poder de administrador sobre las personas del equipo que lidera (Configuración → Equipos).'),
      points: [
        b('Their clients and loads, so you can step in on a problem.', 'Sus clientes y cargas, para que puedas intervenir en un problema.'),
        b('Their attendance: clock times, breaks, lateness.', 'Su asistencia: horas de entrada, descansos, retrasos.'),
        b('Their shared day plans on the Calendar’s Team plans tab.', 'Sus planes del día compartidos en la pestaña Planes del equipo del Calendario.'),
        b('Their book of business in the Directory.', 'Su cartera en el Directorio.'),
        b('Their onboarding progress, on My onboarding → Team progress, where you tick the team-lead and mentor steps.', 'Su avance de onboarding, en Mi onboarding → Avance del equipo, donde marcas los pasos de líder y mentor.'),
        b('Their details and permissions — but you cannot add or remove people, change a role, or give a permission you do not hold.', 'Sus datos y permisos — pero no puedes agregar ni quitar personas, cambiar un rol, ni dar un permiso que no tienes.'),
      ],
      callouts: [
        { tone: 'why', text: b('Their task lists are private, even from you. You see only the plan they share. That is on purpose: a private notepad people trust is worth more than one they fill in for show.', 'Sus listas de tareas son privadas, incluso para ti. Solo ves el plan que comparten. Es a propósito: una libreta privada en la que confían vale más que una que llenan para aparentar.') },
      ],
    },
    {
      id: 'rhythm',
      title: b('The team rhythm', 'El ritmo del equipo'),
      intro: b('Put each of these on the calendar as a repeating event with your team invited. A rhythm people can count on is half of leadership.', 'Pon cada uno en el calendario como evento que se repite con tu equipo invitado. Un ritmo con el que la gente puede contar es la mitad del liderazgo.'),
      table: [
        [b('When', 'Cuándo'), b('What', 'Qué'), b('How long', 'Duración')],
        [b('Every morning', 'Cada mañana'), b('Huddle: yesterday’s wins, today’s focus, anything stuck. Standing up.', 'Reunión corta: logros de ayer, enfoque de hoy, algo atorado. De pie.'), b('10 min', '10 min')],
        [b('Weekly, each person', 'Semanal, cada persona'), b('One-to-one (agenda below)', 'Uno a uno (agenda abajo)'), b('30 min', '30 min')],
        [b('Weekly, each person', 'Semanal, cada persona'), b('Coach one real call', 'Coachear una llamada real'), b('20 min', '20 min')],
        [b('Friday', 'Viernes'), b('Team pipeline review and one short training', 'Revisión del pipeline del equipo y una capacitación corta'), b('45 min', '45 min')],
        [b('Last Friday', 'Último viernes'), b('Monthly results, recognition, next month’s goals', 'Resultados del mes, reconocimiento, metas del próximo mes'), b('60 min', '60 min')],
      ],
    },
    {
      id: 'daily',
      title: b('Your day as a manager', 'Tu día como gerente'),
      steps: [
        { text: b('Before the huddle, open Calendar → Team plans. Who has not shared? Who is overloaded? Who has no prospecting blocks?', 'Antes de la reunión, abre Calendario → Planes del equipo. ¿Quién no ha compartido? ¿Quién está sobrecargado? ¿Quién no tiene bloques de prospección?') },
        { text: b('Check loads on the road for your team. Fix nothing yourself that a broker can fix with your advice.', 'Revisa las cargas en camino de tu equipo. No arregles tú nada que un broker pueda arreglar con tu consejo.') },
        { text: b('Run the huddle. End on time.', 'Haz la reunión corta. Termina a tiempo.') },
        { text: b('Spend most of the day beside your people: listening to calls, helping with a hard negotiation, answering questions fast.', 'Pasa la mayor parte del día junto a tu gente: escuchando llamadas, ayudando en una negociación difícil, respondiendo rápido.') },
        { text: b('Say one specific thank-you every day, in person or in the team room.', 'Da un agradecimiento específico cada día, en persona o en la sala del equipo.') },
      ],
    },
    {
      id: 'one-to-one',
      title: b('The weekly one-to-one', 'El uno a uno semanal'),
      intro: b('Their meeting, not yours. Same day and time every week; never cancel it twice in a row.', 'Su reunión, no la tuya. Mismo día y hora cada semana; nunca la canceles dos veces seguidas.'),
      steps: [
        { text: b('How are you? Really. Two minutes on the person, not the numbers.', '¿Cómo estás? De verdad. Dos minutos sobre la persona, no los números.') },
        { text: b('Their numbers for the week: calls, conversations, prospects, quotes, loads. Compare with last week, not with others.', 'Sus números de la semana: llamadas, conversaciones, prospectos, cotizaciones, cargas. Compara con la semana pasada, no con otros.') },
        { text: b('One win: what went well, and why.', 'Un logro: qué salió bien, y por qué.') },
        { text: b('One obstacle: what is in the way, and what would help.', 'Un obstáculo: qué estorba, y qué ayudaría.') },
        { text: b('One skill to practise this week.', 'Una habilidad para practicar esta semana.') },
        { text: b('Commitments, written down by them, checked next week.', 'Compromisos, escritos por ellos, revisados la próxima semana.') },
      ],
    },
    {
      id: 'coaching',
      title: b('Coaching a call', 'Coachear una llamada'),
      intro: b('Listen to one real call (live or recorded) and score it together. Ask them to score themselves first.', 'Escucha una llamada real (en vivo o grabada) y califíquenla juntos. Pídeles que se califiquen primero.'),
      table: [
        [b('Part of the call', 'Parte de la llamada'), b('What good looks like', 'Cómo se ve bien hecho'), b('1–5', '1–5')],
        [b('Opening', 'Apertura'), b('Name, TTL, a reason in one breath; asks permission to continue', 'Nombre, TTL, un motivo de corrido; pide permiso para seguir'), b('', '')],
        [b('Questions', 'Preguntas'), b('Open questions about what, how often, where, who they use now', 'Preguntas abiertas sobre qué, qué tan seguido, a dónde, con quién trabajan'), b('', '')],
        [b('Listening', 'Escucha'), b('They talk more than you; you use what they said', 'Ellos hablan más que tú; usas lo que dijeron'), b('', '')],
        [b('Presenting TTL', 'Presentar TTL'), b('One clear benefit tied to their problem', 'Un beneficio claro ligado a su problema'), b('', '')],
        [b('Objections', 'Objeciones'), b('Agree, ask, offer something small', 'Coincidir, preguntar, ofrecer algo pequeño'), b('', '')],
        [b('Next step', 'Siguiente paso'), b('A specific next step with a date', 'Un siguiente paso específico con fecha'), b('', '')],
        [b('Notes', 'Notas'), b('Written in TTMS before the next call', 'Escritas en TTMS antes de la siguiente llamada'), b('', '')],
      ],
      callouts: [
        { tone: 'tip', text: b('Pick one thing to improve, not seven. Next week, listen for that one thing.', 'Elige una cosa para mejorar, no siete. La próxima semana, escucha esa cosa.') },
      ],
    },
    {
      id: 'sales-training',
      title: b('Training your team to sell', 'Capacitar a tu equipo para vender'),
      points: [
        b('Role-play objections in the Friday session: one person is the shipper, one the broker, the team scores.', 'Practiquen objeciones en la sesión del viernes: uno es el shipper, otro el broker, el equipo califica.'),
        b('Share the best call of the week. Let the broker who made it explain what they did.', 'Compartan la mejor llamada de la semana. Deja que el broker que la hizo explique qué hizo.'),
        b('Give each person a sector or lane focus for the month so their list builds on itself.', 'Dale a cada persona un sector o ruta de enfoque para el mes, para que su lista crezca sobre sí misma.'),
        b('Teach negotiation on both sides: holding the client’s price and finding the carrier’s.', 'Enseña a negociar en ambos lados: sostener el precio del cliente y encontrar el del transportista.'),
        b('Pipeline hygiene: every prospect has a next step and a date. Check one person’s pipeline at random each week.', 'Higiene del pipeline: cada prospecto tiene siguiente paso y fecha. Revisa al azar el pipeline de una persona cada semana.'),
      ],
    },
    {
      id: 'new-hires',
      title: b('Bringing a new hire through 90 days', 'Acompañar a un nuevo en sus 90 días'),
      table: [
        [b('Stage', 'Etapa'), b('Your part', 'Tu parte')],
        [b('Before they start', 'Antes de empezar'), b('Know their name, background and start date. Make sure they are on your team in Settings.', 'Conoce su nombre, experiencia y fecha de inicio. Asegúrate de que estén en tu equipo en Configuración.')],
        [b('Training week', 'Semana de training'), b('Visit training once. Lunch with them.', 'Visita el training una vez. Almuerza con ellos.')],
        [b('Weeks 2–4', 'Semanas 2–4'), b('Introduce them to the team, pair them with a mentor, check in daily for five minutes.', 'Preséntalos al equipo, asígnales un mentor, revisa con ellos cinco minutos cada día.')],
        [b('Months 2–3', 'Meses 2–3'), b('Weekly one-to-ones, coached calls, targets agreed and reviewed, the 90-day evaluation.', 'Uno a uno semanales, llamadas coacheadas, metas acordadas y revisadas, la evaluación de 90 días.')],
      ],
      callouts: [
        { tone: 'tip', text: b('My onboarding → Team progress shows where each new person on your team is, and what is behind.', 'Mi onboarding → Avance del equipo muestra dónde va cada persona nueva de tu equipo, y qué está atrasado.') },
      ],
    },
    {
      id: 'feedback',
      title: b('Giving feedback', 'Dar retroalimentación'),
      points: [
        b('Situation, Behaviour, Impact: "On Tuesday’s call with Acme (situation), you gave the price before asking about the freight (behaviour), so we quoted the wrong truck (impact)."', 'Situación, Comportamiento, Impacto: "En la llamada del martes con Acme (situación), diste el precio antes de preguntar por la carga (comportamiento), y cotizamos el camión equivocado (impacto)."'),
        b('Then ask: "What would you do differently?" Let them find it.', 'Luego pregunta: "¿Qué harías diferente?" Deja que lo encuentren.'),
        b('Praise in public, correct in private.', 'Felicita en público, corrige en privado.'),
        b('Soon beats perfect: feedback the same day is worth more than a polished talk a month later.', 'Pronto es mejor que perfecto: la retroalimentación el mismo día vale más que una charla pulida un mes después.'),
        b('Far more praise than correction. People who feel seen work harder on what you ask.', 'Mucho más reconocimiento que corrección. Quien se siente visto trabaja más en lo que le pides.'),
      ],
    },
    {
      id: 'retention',
      title: b('Keeping good people', 'Retener a la buena gente'),
      points: [
        b('Brokers leave managers more than companies. The one-to-one is your best retention tool.', 'Los brokers dejan a los gerentes más que a las empresas. El uno a uno es tu mejor herramienta de retención.'),
        b('Watch for warning signs: late more often, fewer calls, quiet in the huddle, stops sharing a plan. Ask, kindly, early.', 'Fíjate en las señales: más retrasos, menos llamadas, callado en la reunión, deja de compartir su plan. Pregunta, con amabilidad, temprano.'),
        b('Make the path visible: what does it take to become a senior broker here? Say it out loud.', 'Haz visible el camino: ¿qué se necesita para ser bróker senior aquí? Dilo en voz alta.'),
        b('Celebrate first loads loudly. Everybody remembers their first.', 'Celebra fuerte las primeras cargas. Todos recuerdan la suya.'),
      ],
    },
    {
      id: 'hard',
      title: b('When someone is struggling', 'Cuando alguien tiene dificultades'),
      steps: [
        { text: b('Be clear about the gap: what is expected, what is happening, with numbers.', 'Sé claro sobre la diferencia: qué se espera, qué está pasando, con números.') },
        { text: b('Find the cause together: skill, will, or something outside work.', 'Encuentren juntos la causa: habilidad, voluntad, o algo fuera del trabajo.') },
        { text: b('Agree a short plan: two or three actions, support from you or a mentor, a date to review.', 'Acuerden un plan corto: dos o tres acciones, apoyo tuyo o de un mentor, una fecha para revisar.') },
        { text: b('Write it down and share it with them.', 'Escríbelo y compártelo con ellos.') },
        { text: b('If it does not improve, involve HR early — before a decision, not after.', 'Si no mejora, involucra a RR. HH. temprano — antes de una decisión, no después.') },
      ],
    },
    {
      id: 'month',
      title: b('Your month', 'Tu mes'),
      points: [
        b('Team results against target: loads, revenue, broker fee, new clients — and the trend over three months.', 'Resultados del equipo contra la meta: cargas, ingresos, comisión, clientes nuevos — y la tendencia de tres meses.'),
        b('Each person: one strength to use more, one skill to build.', 'Cada persona: una fortaleza para usar más, una habilidad para desarrollar.'),
        b('Review with management. Bring problems with a suggestion.', 'Revisa con la gerencia. Lleva los problemas con una propuesta.'),
        b('Recognise publicly: the most improved, the best save of a load, the first loads.', 'Reconoce en público: el que más mejoró, el mejor rescate de una carga, las primeras cargas.'),
      ],
    },
  ],
  quiz: [
    { q: b('A broker on your team is stuck on a hard negotiation. Best first move?', 'Un broker de tu equipo está atorado en una negociación difícil. ¿Mejor primer paso?'),
      options: [b('Take the call yourself', 'Tomar tú la llamada'), b('Ask what they have tried and coach the next step', 'Preguntar qué ha intentado y coachear el siguiente paso')],
      answer: 1, why: b('Taking it fixes today and teaches nothing.', 'Tomarla arregla hoy y no enseña nada.') },
    { q: b('Can you see your team’s private task lists?', '¿Puedes ver las listas privadas de tareas de tu equipo?'),
      options: [b('Yes', 'Sí'), b('No — only the plans they share', 'No — solo los planes que comparten')],
      answer: 1, why: b('The plan is a copy they hand over; the list stays theirs.', 'El plan es una copia que entregan; la lista sigue siendo suya.') },
  ],
};
