import { b, type Guide } from '../guideTypes';

export const CALENDAR_GUIDE: Guide = {
  id: 'calendar',
  group: 'app',
  icon: 'calendar',
  title: b('Calendar and planning', 'Calendario y planificación'),
  summary: b(
    'See your tasks and events by day, week or month, drag things to new times, invite colleagues, and let TTMS remind you to plan your day, your week and your month.',
    'Mira tus tareas y eventos por día, semana o mes, arrastra cosas a otras horas, invita a compañeros, y deja que TTMS te recuerde planificar tu día, tu semana y tu mes.',
  ),
  minutes: 15,
  tryHref: '/dashboard/calendar',
  tracks: 'all',
  sections: [
    {
      id: 'tour',
      title: b('The Calendar page', 'La página del Calendario'),
      intro: b('Your calendar shows the same tasks as My tasks, plus your events, holidays, and — for your eyes only — anything you shared.', 'Tu calendario muestra las mismas tareas de Mis tareas, más tus eventos, los feriados y — solo para ti — lo que compartiste.'),
      screen: 'calendar-month',
      steps: [
        { spot: 1, text: b('Today jumps back to today. The arrows go back and forward.', 'Hoy regresa al día de hoy. Las flechas van atrás y adelante.') },
        { spot: 2, text: b('Choose how much to see: Day, 4 days, Week or Month.', 'Elige cuánto ver: Día, 4 días, Semana o Mes.') },
        { spot: 3, text: b('My tasks and My events switch each layer on or off. Tasks are blue, events teal, until you give them a colour of your own.', 'Mis tareas y Mis eventos prenden o apagan cada capa. Las tareas son azules y los eventos verde azulado, hasta que les pongas tu propio color.') },
        { spot: 4, text: b('The small month jumps to any date.', 'El mes pequeño salta a cualquier fecha.') },
        { spot: 5, text: b('Click a day to see it, or the + on a day to add something on that day.', 'Haz clic en un día para verlo, o en el + de un día para agregar algo ese día.') },
        { spot: 6, text: b('Guatemalan public holidays are already on it, for everybody.', 'Los feriados de Guatemala ya están puestos, para todos.') },
      ],
    },
    {
      id: 'week',
      title: b('The week view: drag, stretch, double-click', 'La vista semanal: arrastrar, estirar, doble clic'),
      intro: b('On a computer, Week and Day are an hour grid, like Google Calendar.', 'En una computadora, Semana y Día son una cuadrícula por horas, como Google Calendar.'),
      screen: 'calendar-week',
      steps: [
        { spot: 1, text: b('Double-click an empty time to add an event there.', 'Haz doble clic en una hora vacía para agregar un evento ahí.') },
        { spot: 2, text: b('Drag a block to another time or another day.', 'Arrastra un bloque a otra hora o a otro día.') },
        { spot: 3, text: b('Pull the bottom edge of a block to make it longer or shorter.', 'Jala el borde de abajo de un bloque para hacerlo más largo o más corto.') },
        { spot: 4, text: b('Zoom in for taller hours and bigger names, or out to see the whole day at once.', 'Acerca para horas más altas y nombres más grandes, o aleja para ver todo el día.') },
        { spot: 5, text: b('All day: things with a date and no time.', 'Todo el día: cosas con fecha y sin hora.') },
      ],
      callouts: [
        { tone: 'tip', text: b('When you drag, stretch or edit one date of a repeating event, TTMS asks which to change: this event, this and following events, or all events. Choose "This event" for a one-off change. A repeating task asks too: just this one, or this and the ones after it.', 'Cuando arrastras, estiras o editas una fecha de un evento que se repite, TTMS pregunta cuál cambiar: este evento, este y los siguientes, o todos los eventos. Elige "Este evento" para un cambio de una vez. Una tarea que se repite también pregunta: solo esta, o esta y las siguientes.') },
        { tone: 'tip', text: b('On a phone, the week is a list by day instead of a grid.', 'En el teléfono, la semana es una lista por día en lugar de una cuadrícula.') },
        { tone: 'why', text: b('All times are office time — Guatemala. A client in Chicago saying "3pm" may mean a different hour for you; check before you write it down.', 'Todas las horas son hora de la oficina — Guatemala. Un cliente en Chicago que dice "3pm" puede querer decir otra hora para ti; revisa antes de anotarla.') },
      ],
    },
    {
      id: 'events',
      title: b('Add an event', 'Agregar un evento'),
      steps: [
        { text: b('Double-click a time, or press + on a day, and choose Event.', 'Haz doble clic en una hora, o presiona + en un día, y elige Evento.') },
        { text: b('Pick what sort of event: Call, Online meeting, In-person meeting, Focus time, Planning, Training, Break, Company activity or Other. It is a label to help you see your week.', 'Elige qué tipo de evento: Llamada, Reunión en línea, Reunión en persona, Tiempo de enfoque, Planificación, Capacitación, Descanso, Actividad de la empresa u Otro. Es una etiqueta para ayudarte a ver tu semana.') },
        { text: b('Set the start and end, and a reminder.', 'Pon el inicio y el final, y un recordatorio.') },
        { text: b('To invite colleagues: add them in With, then switch on "Invite them — put it on their calendars".', 'Para invitar compañeros: agrégalos en Con, y activa "Invitarlos — ponerlo en sus calendarios".') },
      ],
      callouts: [
        { tone: 'why', text: b('Invited colleagues can Accept or Decline. When you move, change or delete the event, their calendars follow and they get a chat message. They can choose their own colour and reminders, but not change the event.', 'Los compañeros invitados pueden Aceptar o Rechazar. Cuando mueves, cambias o borras el evento, sus calendarios lo siguen y reciben un mensaje en el chat. Pueden elegir su color y recordatorios, pero no cambiar el evento.') },
        { tone: 'warn', text: b('A "Company activity" is only on your own calendar. To tell everybody about something, post it in the Everyone room.', 'Una "Actividad de la empresa" solo está en tu calendario. Para avisarle a todos algo, publícalo en la sala Todos.') },
      ],
    },
    {
      id: 'planning',
      title: b('Planning prompts: the habit TTMS builds for you', 'Avisos de planificación: el hábito que TTMS crea por ti'),
      intro: b('TTMS asks you to set a time for four kinds of planning. Pick a time once, and it adds the planning to your calendar with a reminder.', 'TTMS te pide poner una hora para cuatro tipos de planificación. Elige una hora una vez, y la agrega a tu calendario con un recordatorio.'),
      screen: 'planning-prompt',
      steps: [
        { spot: 1, text: b('Morning review: a quick look over today’s plan. If you planned last night, it takes five minutes. Not asked after 1pm.', 'Revisión de la mañana: un vistazo rápido al plan de hoy. Si planificaste anoche, toma cinco minutos. No se pregunta después de la 1pm.') },
        { spot: 1, text: b('End of day: plan tomorrow before you leave.', 'Final del día: planifica mañana antes de irte.') },
        { spot: 1, text: b('Weekly, on Friday afternoon: plan next week. Monthly, on the last Friday: plan next month.', 'Semanal, el viernes en la tarde: planifica la siguiente semana. Mensual, el último viernes: planifica el siguiente mes.') },
        { spot: 2, text: b('Pick the start time and how long. "Your day" beside it shows your shift and what you already have, so you pick a free slot.', 'Elige la hora de inicio y cuánto dura. "Tu día" a un lado muestra tu turno y lo que ya tienes, para que escojas un espacio libre.') },
        { spot: 3, text: b('Tick "Repeat every weekday at this time" if you always plan at the same time. Leave it off if your days change — you will be asked again the next working day.', 'Marca "Repetir cada día laboral a esta hora" si siempre planificas a la misma hora. Déjalo sin marcar si tus días cambian — te preguntará otra vez el siguiente día laboral.') },
        { spot: 4, text: b('Already have a planning slot? Use one you have points TTMS at it instead of adding another.', '¿Ya tienes un espacio de planificación? Usar uno que tienes le dice a TTMS que use ese en lugar de agregar otro.') },
        { spot: 5, text: b('Not now asks again tomorrow. Don’t ask again stops it until you switch it back on in Planning time on the Calendar.', 'Ahora no pregunta otra vez mañana. No preguntar más lo detiene hasta que lo vuelvas a activar en Tiempo de planificación en el Calendario.') },
      ],
      callouts: [
        { tone: 'tip', text: b('Planning time on the Calendar page lists all four with their times. Change or set any of them there.', 'Tiempo de planificación en la página del Calendario muestra los cuatro con sus horas. Cambia o pon cualquiera ahí.') },
      ],
    },
    {
      id: 'share',
      title: b('Sharing your day plan', 'Compartir tu plan del día'),
      points: [
        b('When you tick your morning review Done, TTMS shares that day’s plan. When you tick end-of-day planning Done, it shares the next working day’s. A notice tells you each time.', 'Cuando marcas tu revisión de la mañana como Hecha, TTMS comparte el plan de ese día. Cuando marcas la planificación del final del día como Hecha, comparte el del siguiente día laboral. Un aviso te lo dice cada vez.'),
        b('What is shared is a copy: the titles and times of your tasks and events. Never whether you finished them.', 'Lo que se comparte es una copia: los títulos y horas de tus tareas y eventos. Nunca si los terminaste.'),
        b('Your team lead (and admins) see it on Team plans. You see exactly what was shared in My shared plan.', 'Tu líder de equipo (y los administradores) lo ven en Planes del equipo. Tú ves exactamente lo que se compartió en Mi plan compartido.'),
        b('Mark any item Busy to share only that you are busy then, not what it is.', 'Marca cualquier elemento como Ocupado para compartir solo que estás ocupado, no qué es.'),
        b('Changed your plan after sharing? Share again — the copy does not follow your edits.', '¿Cambiaste tu plan después de compartir? Comparte otra vez — la copia no sigue tus cambios.'),
      ],
    },
    {
      id: 'team-plans',
      title: b('Team plans (team leads and admins)', 'Planes del equipo (líderes y administradores)'),
      points: [
        b('The Team plans tab shows what each person on your team shared for the day, in four ways: Agenda, Table, Timeline and Week.', 'La pestaña Planes del equipo muestra lo que cada persona de tu equipo compartió para el día, de cuatro formas: Agenda, Tabla, Línea de tiempo y Semana.'),
        b('"Not shared yet" means that person has not ticked their planning Done today. A quick, kind message usually fixes it.', '"Aún no compartido" quiere decir que esa persona no ha marcado su planificación como Hecha hoy. Un mensaje rápido y amable suele resolverlo.'),
        b('Find a person, filter to one team, or show only people who shared.', 'Busca a una persona, filtra a un equipo, o muestra solo a quienes compartieron.'),
      ],
      callouts: [
        { tone: 'why', text: b('A plan is shared to help a team work together, not to score people. Use it to spot who is overloaded or free to help.', 'Un plan se comparte para ayudar al equipo a trabajar juntos, no para calificar a la gente. Úsalo para ver quién está sobrecargado o libre para ayudar.') },
      ],
    },
    {
      id: 'reminder-settings',
      title: b('How reminders reach you', 'Cómo te llegan los recordatorios'),
      points: [
        b('Beside the calendar, "Reminders for my tasks and events" sets how they are sent: Email (when an admin allows it) and A private chat message.', 'Junto al calendario, "Recordatorios de mis tareas y eventos" define cómo se envían: Correo (si un administrador lo permite) y Mensaje privado en el chat.'),
        b('With both off, none of your reminders are sent.', 'Con ambos apagados, no se envía ninguno de tus recordatorios.'),
      ],
    },
    {
      id: 'celebrations',
      title: b('Birthdays and anniversaries (admin and HR)', 'Cumpleaños y aniversarios (admin y RR. HH.)'),
      points: [
        b('Admin and HR see a layer with everyone’s birthdays and work anniversaries. Nobody else does.', 'Admin y RR. HH. ven una capa con los cumpleaños y aniversarios de todos. Nadie más.'),
        b('Click a name to set a one-off reminder. Standing reminders go out at 8am Guatemala time.', 'Haz clic en un nombre para poner un recordatorio de una vez. Los recordatorios fijos salen a las 8am hora de Guatemala.'),
        b('"Not announced" means that person asked not to be named in the Everyone room.', '"No anunciado" quiere decir que esa persona pidió no ser nombrada en la sala Todos.'),
      ],
    },
  ],
  faq: [
    { q: b('I moved an event and my colleague says it is still at the old time.', 'Moví un evento y mi compañero dice que sigue a la hora anterior.'),
      a: b('Ask them to reload the page. Their copy follows yours as soon as you save.', 'Pídele que recargue la página. Su copia sigue la tuya en cuanto guardas.') },
    { q: b('Where are my tasks from months ago?', '¿Dónde están mis tareas de hace meses?'),
      a: b('Go back to that month on the Calendar. Work older than 90 days moves to history and is shown there, read-only.', 'Ve a ese mes en el Calendario. El trabajo de más de 90 días pasa al historial y se muestra ahí, solo para leer.') },
    { q: b('Why does the planning card keep asking me?', '¿Por qué la tarjeta de planificación me sigue preguntando?'),
      a: b('You set a one-off time, which covers only that day. Tick the repeat box to be asked less.', 'Pusiste una hora de una vez, que cubre solo ese día. Marca la casilla de repetir para que pregunte menos.') },
  ],
  quiz: [
    { q: b('How do you add an event at 3pm Wednesday in the week view?', '¿Cómo agregas un evento el miércoles a las 3pm en la vista semanal?'),
      options: [b('Double-click 3pm on Wednesday', 'Doble clic en las 3pm del miércoles'), b('Email yourself', 'Enviarte un correo'), b('Ask an admin', 'Pedírselo a un administrador')],
      answer: 0, why: b('Double-click any empty time to add an event there.', 'Doble clic en cualquier hora vacía agrega un evento ahí.') },
    { q: b('What does your team lead see when you share your plan?', '¿Qué ve tu líder cuando compartes tu plan?'),
      options: [b('Everything on your list, live', 'Todo en tu lista, en vivo'), b('A copy of titles and times', 'Una copia de títulos y horas'), b('Which tasks you finished', 'Qué tareas terminaste')],
      answer: 1, why: b('It is a copy, never live, and never says what was done.', 'Es una copia, nunca en vivo, y nunca dice qué se hizo.') },
  ],
};
