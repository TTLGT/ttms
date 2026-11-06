import { b, type Guide } from '../guideTypes';

/**
 * The broker's planning playbook. The numbers in it are starting points for a
 * team lead to adjust, not company targets — say so wherever one appears,
 * because a new hire will read any number on this page as a rule.
 */
export const BROKER_PLANNING_GUIDE: Guide = {
  id: 'broker-planning',
  group: 'sales',
  icon: 'target',
  title: b('Plan like a top broker', 'Planifica como un bróker top'),
  summary: b(
    'The habits that separate brokers who grow from brokers who give up: a planned day, a reviewed week and a measured month — and exactly how to do each one in TTMS.',
    'Los hábitos que separan a los brokers que crecen de los que se rinden: un día planificado, una semana revisada y un mes medido — y cómo hacer cada uno en TTMS.',
  ),
  minutes: 20,
  tryHref: '/dashboard/calendar',
  tracks: ['broker', 'salesManager'],
  sections: [
    {
      id: 'why',
      title: b('Why plan at all', 'Por qué planificar'),
      points: [
        b('A broker’s day is full of interruptions: a carrier calls, a client changes a time, a load is late. Without a plan, the urgent eats the important — and the important is finding new clients.', 'El día de un broker está lleno de interrupciones: llama un transportista, un cliente cambia una hora, una carga va tarde. Sin plan, lo urgente se come lo importante — y lo importante es encontrar clientes nuevos.'),
        b('Planning is ten minutes that saves two hours.', 'Planificar son diez minutos que ahorran dos horas.'),
        b('New brokers often take months to book their first load. The ones who make it are the ones who prospect every single day, even on busy days.', 'Muchas veces los brokers nuevos tardan meses en cerrar su primera carga. Los que lo logran son los que prospectan todos los días, incluso los días ocupados.'),
      ],
    },
    {
      id: 'daily',
      title: b('Your day', 'Tu día'),
      intro: b('An example day in office time. Your team lead may change it; the shape is what matters: prospecting in protected blocks, loads in between.', 'Un día de ejemplo en hora de la oficina. Tu líder puede cambiarlo; lo que importa es la forma: prospectar en bloques protegidos, las cargas en medio.'),
      screen: 'broker-day',
      table: [
        [b('Time', 'Hora'), b('What', 'Qué'), b('In TTMS', 'En TTMS')],
        [b('7:00', '7:00'), b('Clock in. Morning review: today’s plan, loads on the road, who to follow up', 'Marca entrada. Revisión de la mañana: el plan de hoy, cargas en camino, a quién dar seguimiento'), b('Morning review slot → tick Done (shares your plan)', 'Espacio de revisión → marcar Hecha (comparte tu plan)')],
        [b('7:15', '7:15'), b('Check every load on the road. Any problem? Act now, before the client calls', 'Revisa cada carga en camino. ¿Algún problema? Actúa ya, antes de que llame el cliente'), b('Orders, load rooms in Chat', 'Órdenes, salas de carga en el Chat')],
        [b('8:00', '8:00'), b('Prospecting block 1 — calls, no interruptions', 'Bloque de prospección 1 — llamadas, sin interrupciones'), b('Focus time event, 90 min', 'Evento de Tiempo de enfoque, 90 min')],
        [b('9:30', '9:30'), b('Quotes and follow-ups from the morning', 'Cotizaciones y seguimientos de la mañana'), b('Quote calculator, Waiting on someone column', 'Calculadora, columna Esperando a alguien')],
        [b('10:00', '10:00'), b('Break', 'Descanso'), b('Clock: Start break', 'Reloj: Iniciar descanso')],
        [b('10:15', '10:15'), b('Covering loads: find carriers, negotiate, send for signature', 'Cubrir cargas: buscar transportistas, negociar, enviar para firma'), b('Orders, Carriers', 'Órdenes, Transportistas')],
        [b('12:00', '12:00'), b('Lunch', 'Almuerzo'), b('Clock', 'Reloj')],
        [b('1:00', '1:00'), b('Prospecting block 2 — the West Coast is awake now', 'Bloque de prospección 2 — la costa oeste ya despertó'), b('Focus time event, 90 min', 'Evento de Tiempo de enfoque, 90 min')],
        [b('2:30', '2:30'), b('Follow up quotes, update clients on their loads', 'Seguimiento de cotizaciones, informar a clientes de sus cargas'), b('Tasks, Chat', 'Tareas, Chat')],
        [b('3:30', '3:30'), b('End-of-day planning: tomorrow’s calls, follow-ups and loads', 'Planificación del final del día: llamadas, seguimientos y cargas de mañana'), b('End-of-day slot → tick Done', 'Espacio de final del día → marcar Hecha')],
      ],
      callouts: [
        { tone: 'tip', text: b('Protect the prospecting blocks like a meeting with your best client. Put them on the calendar as Focus time and do not schedule over them.', 'Protege los bloques de prospección como una reunión con tu mejor cliente. Ponlos en el calendario como Tiempo de enfoque y no programes nada encima.') },
        { tone: 'why', text: b('US shippers start early on the East Coast and finish late on the West. From March to November, 7am in Guatemala is already 9am in New York.', 'Los shippers de EE. UU. empiezan temprano en la costa este y terminan tarde en la oeste. De marzo a noviembre, las 7am en Guatemala ya son las 9am en Nueva York.') },
      ],
    },
    {
      id: 'daily-howto',
      title: b('Set up your daily planning in TTMS (once)', 'Configura tu planificación diaria en TTMS (una vez)'),
      steps: [
        { text: b('When the planning card appears, pick 7:00 for the morning review, 15 minutes, and tick Repeat every weekday.', 'Cuando aparezca la tarjeta de planificación, elige 7:00 para la revisión de la mañana, 15 minutos, y marca Repetir cada día laboral.') },
        { text: b('Pick 3:30 for end-of-day planning, 20 minutes, repeat every weekday.', 'Elige 3:30 para la planificación del final del día, 20 minutos, repetir cada día laboral.') },
        { text: b('In the week view, double-click 8:00 and add a Focus time event "Prospecting", 90 minutes, repeating every weekday. Do the same at 1:00.', 'En la vista semanal, haz doble clic en 8:00 y agrega un evento de Tiempo de enfoque "Prospección", 90 minutos, repitiendo cada día laboral. Haz lo mismo a la 1:00.') },
        { text: b('Each afternoon, add tomorrow’s tasks: every follow-up with a time, every load that needs a carrier, the number of calls you will make.', 'Cada tarde, agrega las tareas de mañana: cada seguimiento con hora, cada carga que necesita transportista, cuántas llamadas harás.') },
        { text: b('Put them in order in the Queue. Tick end-of-day planning Done.', 'Ponlas en orden en la Fila. Marca la planificación del final del día como Hecha.') },
      ],
    },
    {
      id: 'weekly',
      title: b('Your week — Friday afternoon', 'Tu semana — viernes en la tarde'),
      intro: b('TTMS asks you on Friday from noon to pick a time for weekly planning. 45 minutes is enough.', 'TTMS te pide el viernes desde mediodía elegir una hora para la planificación semanal. 45 minutos son suficientes.'),
      points: [
        b('Look back: how many calls, conversations, new prospects, quotes and loads this week? Write the five numbers down.', 'Mira atrás: ¿cuántas llamadas, conversaciones, prospectos nuevos, cotizaciones y cargas esta semana? Anota los cinco números.'),
        b('What worked? Which sector, which method, which time of day gave you the most conversations? Do more of it.', '¿Qué funcionó? ¿Qué sector, qué método, qué hora del día te dio más conversaciones? Haz más de eso.'),
        b('Your pipeline: every prospect with a next step and a date. Anyone without one gets one now — or comes off the list.', 'Tu pipeline: cada prospecto con un siguiente paso y fecha. Quien no tenga, recibe uno ahora — o sale de la lista.'),
        b('Your clients: who has not shipped with you in two weeks? Plan a call.', 'Tus clientes: ¿quién no ha enviado contigo en dos semanas? Planifica una llamada.'),
        b('Your carriers: which ones did a good job? Note them so you call them first next time.', 'Tus transportistas: ¿cuáles hicieron buen trabajo? Anótalos para llamarlos primero la próxima vez.'),
        b('Next week: choose one sector or lane to focus on, and put next week’s prospecting blocks and follow-ups on the calendar.', 'La próxima semana: elige un sector o ruta en qué enfocarte, y pon en el calendario los bloques de prospección y seguimientos.'),
      ],
    },
    {
      id: 'monthly',
      title: b('Your month — the last Friday', 'Tu mes — el último viernes'),
      points: [
        b('Results against the targets you agreed with your team lead: loads, revenue, broker fee, new clients.', 'Resultados contra las metas acordadas con tu líder: cargas, ingresos, comisión, clientes nuevos.'),
        b('Your best three clients and your best three lanes. How do you get more of the same?', 'Tus tres mejores clientes y tus tres mejores rutas. ¿Cómo consigues más de lo mismo?'),
        b('One skill to get better at next month — negotiating, objections, a new load board — and who can help you.', 'Una habilidad para mejorar el próximo mes — negociar, objeciones, un load board nuevo — y quién te puede ayudar.'),
        b('Clean the list: close tasks that will never happen as Not done, archive prospects who said no twice.', 'Limpia la lista: cierra como No hechas las tareas que nunca pasarán, archiva los prospectos que dijeron que no dos veces.'),
        b('Bring the summary to your one-to-one with your team lead.', 'Lleva el resumen a tu reunión uno a uno con tu líder.'),
      ],
    },
    {
      id: 'ramp',
      title: b('Your first 90 days, roughly', 'Tus primeros 90 días, más o menos'),
      intro: b('A typical ramp for a new broker. Your team lead sets the real targets with you.', 'Un avance típico para un bróker nuevo. Tu líder pone las metas reales contigo.'),
      table: [
        [b('When', 'Cuándo'), b('Focus', 'Enfoque'), b('You can say you are on track when…', 'Vas bien cuando…')],
        [b('Weeks 1–2', 'Semanas 1–2'), b('Learn the tools, the words and the process', 'Aprender las herramientas, las palabras y el proceso'), b('You can explain the life of a load and use TTMS without help', 'Puedes explicar la vida de una carga y usar TTMS sin ayuda')],
        [b('Weeks 3–4', 'Semanas 3–4'), b('Calling every day, building a list', 'Llamar cada día, armar una lista'), b('You make your daily calls without being reminded, and add prospects every day', 'Haces tus llamadas diarias sin que te lo recuerden, y agregas prospectos cada día')],
        [b('Month 2', 'Mes 2'), b('Quotes and first loads', 'Cotizaciones y primeras cargas'), b('You send quotes every week and book your first loads with less help', 'Envías cotizaciones cada semana y cierras tus primeras cargas con menos ayuda')],
        [b('Month 3', 'Mes 3'), b('Repeat clients', 'Clientes que repiten'), b('A client sends you a second load without you asking', 'Un cliente te manda una segunda carga sin que se la pidas')],
      ],
    },
    {
      id: 'habits',
      title: b('Habits of the brokers who last', 'Hábitos de los brokers que duran'),
      points: [
        b('They write everything down. Memory loses deals.', 'Escriben todo. La memoria pierde negocios.'),
        b('They call back when they said they would — to clients and to carriers.', 'Llaman de vuelta cuando dijeron — a clientes y a transportistas.'),
        b('They tell the client about a problem before the client finds it.', 'Le avisan al cliente de un problema antes de que el cliente lo descubra.'),
        b('They treat carriers as partners. A carrier who is paid fast and treated well takes your next load at a better price.', 'Tratan a los transportistas como socios. Uno al que se le paga rápido y se le trata bien toma tu próxima carga a mejor precio.'),
        b('They ask for help early. Your mentor and your team lead would rather hear a question than fix a mistake.', 'Piden ayuda temprano. Tu mentor y tu líder prefieren oír una pregunta que arreglar un error.'),
      ],
    },
  ],
  quiz: [
    { q: b('When is the best time to plan tomorrow?', '¿Cuál es el mejor momento para planificar mañana?'),
      options: [b('Tomorrow morning', 'Mañana en la mañana'), b('At the end of today', 'Al final de hoy'), b('Never', 'Nunca')],
      answer: 1, why: b('Then the morning review is a five-minute check, and you start calling at once.', 'Así la revisión de la mañana es de cinco minutos, y empiezas a llamar de una vez.') },
    { q: b('A busy day of load problems. What happens to prospecting?', 'Un día ocupado con problemas de cargas. ¿Qué pasa con la prospección?'),
      options: [b('Skip it today', 'Saltarla hoy'), b('Protect at least one block', 'Proteger al menos un bloque')],
      answer: 1, why: b('Today’s prospects are next month’s loads.', 'Los prospectos de hoy son las cargas del próximo mes.') },
  ],
};
