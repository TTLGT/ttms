import { b, type Guide } from '../guideTypes';

export const TASKS_GUIDE: Guide = {
  id: 'tasks',
  group: 'app',
  icon: 'tasks',
  title: b('My tasks', 'Mis tareas'),
  summary: b(
    'Your own private to-do list: add tasks, break them into steps, put them in order, get reminded, and see your day as a queue, a road, a board, sticky notes or a table.',
    'Tu lista de pendientes privada: agrega tareas, divídelas en pasos, ponlas en orden, recibe recordatorios y mira tu día como fila, camino, tablero, notas adhesivas o tabla.',
  ),
  minutes: 18,
  tryHref: '/dashboard/tasks',
  tracks: 'all',
  sections: [
    {
      id: 'tour',
      title: b('The My tasks page', 'La página Mis tareas'),
      intro: b(
        'Only you can see this list — not your manager, not an admin. It is a notepad for getting your work done, not a report on you.',
        'Solo tú puedes ver esta lista — ni tu gerente ni un administrador. Es una libreta para sacar tu trabajo, no un reporte sobre ti.',
      ),
      screen: 'tasks-overview',
      steps: [
        { spot: 1, text: b('Up next: the task with the closest deadline. Press Focus to work on just that one.', 'Lo siguiente: la tarea con la fecha límite más cercana. Presiona Enfoque para trabajar solo en esa.') },
        { spot: 2, text: b('Your streak: how many working days in a row you finished something.', 'Tu racha: cuántos días laborales seguidos terminaste algo.') },
        { spot: 3, text: b('Views: Queue, Path, Board, Sticky notes and Table. Same tasks, five ways to look at them. TTMS remembers the one you used last.', 'Vistas: Fila, Camino, Tablero, Notas adhesivas y Tabla. Las mismas tareas, cinco formas de verlas. TTMS recuerda la última que usaste.') },
        { spot: 4, text: b('Add task opens the editor.', 'Agregar tarea abre el editor.') },
        { spot: 5, text: b('Colour filter: show only tasks of one colour. Edit colours lets you name them — "Calls", "Paperwork".', 'Filtro de color: muestra solo tareas de un color. Editar colores te deja nombrarlos — "Llamadas", "Papeleo".') },
        { spot: 6, text: b('Clear done puts finished tasks away. They leave this page but stay on your calendar.', 'Limpiar hechas guarda las tareas terminadas. Salen de esta página pero siguen en tu calendario.') },
      ],
    },
    {
      id: 'add',
      title: b('Add a task', 'Agregar una tarea'),
      screen: 'tasks-editor',
      steps: [
        { spot: 1, text: b('Press Add task. At the top choose Task (something to do) or Event (something at a time, like a call or a meeting).', 'Presiona Agregar tarea. Arriba elige Tarea (algo por hacer) o Evento (algo a una hora, como una llamada o reunión).') },
        { spot: 2, text: b('Title: start with a verb. "Call Acme about Friday’s load", not "Acme".', 'Título: empieza con un verbo. "Llamar a Acme por la carga del viernes", no "Acme".') },
        { spot: 3, text: b('Starts and Ends: when you will work on it. It shows as a block on your calendar.', 'Empieza y Termina: cuándo vas a trabajar en ella. Aparece como bloque en tu calendario.') },
        { spot: 4, text: b('Due by and Due time: the deadline. This is different from when you work on it — you might work on Tuesday something due Thursday.', 'Fecha límite y Hora límite: el plazo. Es diferente de cuándo trabajas en ella — puedes trabajar el martes algo que vence el jueves.') },
        { spot: 5, text: b('Priority: Low, Normal or High.', 'Prioridad: Baja, Normal o Alta.') },
        { spot: 6, text: b('With: add colleagues from the directory. Order: link a load by its number or link. Notes: anything you need to remember.', 'Con: agrega compañeros del directorio. Orden: enlaza una carga por número o enlace. Notas: lo que necesites recordar.') },
        { spot: 7, text: b('Remind me: pick when you want a reminder — at the time, or minutes, hours or days before.', 'Recordarme: elige cuándo quieres el recordatorio — a la hora, o minutos, horas o días antes.') },
        { spot: 8, text: b('Save.', 'Guardar.') },
      ],
      callouts: [
        { tone: 'tip', text: b('In the Queue view there is a Quick add box: type a title and press Enter to add a task without opening the editor.', 'En la vista Fila hay una caja de Agregar rápido: escribe un título y presiona Enter para agregar una tarea sin abrir el editor.') },
      ],
    },
    {
      id: 'views',
      title: b('The five views', 'Las cinco vistas'),
      table: [
        [b('View', 'Vista'), b('What it shows', 'Qué muestra'), b('Best for', 'Mejor para')],
        [b('Queue', 'Fila'), b('Your tasks numbered in the order you will do them', 'Tus tareas numeradas en el orden en que las harás'), b('Deciding what comes first', 'Decidir qué va primero')],
        [b('Path', 'Camino'), b('The same queue drawn as a road, with steps inside each stop', 'La misma fila dibujada como un camino, con pasos dentro de cada parada'), b('Seeing your day as a journey', 'Ver tu día como un recorrido')],
        [b('Board', 'Tablero'), b('Columns by status. Drag a card from one to the next', 'Columnas por estado. Arrastra una tarjeta de una a otra'), b('Work that moves through stages', 'Trabajo que pasa por etapas')],
        [b('Sticky notes', 'Notas adhesivas'), b('Each task as a coloured note', 'Cada tarea como una nota de color'), b('A quick visual look', 'Un vistazo visual rápido')],
        [b('Table', 'Tabla'), b('Rows with status, priority and dates', 'Filas con estado, prioridad y fechas'), b('Sorting and reviewing many tasks', 'Ordenar y revisar muchas tareas')],
      ],
    },
    {
      id: 'board',
      title: b('The board and its columns', 'El tablero y sus columnas'),
      screen: 'tasks-board',
      steps: [
        { spot: 1, text: b('Six columns come built in: To do, Ready, In progress, Waiting on someone, In review and Done.', 'Seis columnas vienen incluidas: Por hacer, Lista, En progreso, Esperando a alguien, En revisión y Hecho.') },
        { spot: 2, text: b('Drag a card to another column to change its status.', 'Arrastra una tarjeta a otra columna para cambiar su estado.') },
        { spot: 3, text: b('Columns lets you hide a column you do not use, drag them into another order, or add up to twelve of your own — "Quoted", "Follow up Friday".', 'Columnas te deja ocultar una columna que no usas, arrastrarlas a otro orden o agregar hasta doce propias — "Cotizado", "Seguimiento viernes".') },
      ],
      callouts: [
        { tone: 'why', text: b('Hiding or deleting a column never loses a task: its tasks move to the nearest column on its left. To do and Done can never be hidden.', 'Ocultar o borrar una columna nunca pierde una tarea: sus tareas pasan a la columna más cercana a la izquierda. Por hacer y Hecho nunca se pueden ocultar.') },
        { tone: 'tip', text: b('"Waiting on someone" is the most useful column for a broker: the quote sent, the carrier who said they would call back. Look at it twice a day.', '"Esperando a alguien" es la columna más útil para un broker: la cotización enviada, el transportista que dijo que llamaría. Revísala dos veces al día.') },
      ],
    },
    {
      id: 'steps',
      title: b('Break a task into steps', 'Divide una tarea en pasos'),
      points: [
        b('Open a task and add steps under it: "Get the dimensions", "Check the carrier’s insurance", "Send the rate".', 'Abre una tarea y agrega pasos debajo: "Pedir las medidas", "Revisar el seguro del transportista", "Enviar la tarifa".'),
        b('Tick each one as you go. The card shows how many are done.', 'Marca cada uno mientras avanzas. La tarjeta muestra cuántos van.'),
        b('A step can have its own due date, and can be dragged into another order.', 'Un paso puede tener su propia fecha límite, y se puede arrastrar a otro orden.'),
        b('A step can have time of its own on the calendar too — the calendar-plus button beside it.', 'Un paso también puede tener su propio tiempo en el calendario — el botón de calendario con más junto a él.'),
      ],
    },
    {
      id: 'queue',
      title: b('Put your day in order: the queue and focus', 'Ordena tu día: la fila y el enfoque'),
      points: [
        b('In Queue, the number beside each task is its place in line. Use the arrows (or drag) to move it up or down.', 'En Fila, el número junto a cada tarea es su lugar. Usa las flechas (o arrastra) para subirla o bajarla.'),
        b('Up next always shows the closest deadline, even if it is not first in your queue — so a deadline never sneaks up on you.', 'Lo siguiente siempre muestra la fecha límite más cercana, aunque no sea la primera de tu fila — para que un plazo nunca te sorprenda.'),
        b('Focus opens one task alone on the screen, with a timer. The timer is for you and is not saved anywhere.', 'Enfoque abre una sola tarea en pantalla, con un cronómetro. El cronómetro es para ti y no se guarda en ningún lado.'),
      ],
    },
    {
      id: 'finish',
      title: b('Finish, reschedule or close a task', 'Terminar, reprogramar o cerrar una tarea'),
      steps: [
        { text: b('Done: tick the circle beside the task, or choose Done in the editor’s Status.', 'Hecho: marca el círculo junto a la tarea, o elige Hecho en el Estado del editor.') },
        { text: b('Not done: in the editor’s Status, if it is not going to happen. It stays on your calendar as not done, so the day can be looked back on honestly.', 'No hecho: en el Estado del editor, si no va a pasar. Se queda en tu calendario como no hecha, para revisar el día con honestidad.') },
        { text: b('Reschedule: moves it to another day. The original is closed as Rescheduled on its day, and a copy carries on from the new day with its progress.', 'Reprogramar: la pasa a otro día. La original se cierra como Reprogramada en su día, y una copia sigue desde el nuevo día con su avance.') },
        { text: b('Duplicate makes a copy. Delete removes it for good — one task at a time, from the task itself.', 'Duplicar hace una copia. Borrar la elimina para siempre — una tarea a la vez, desde la propia tarea.') },
        { text: b('Reopen a finished task if it turns out it was not finished after all.', 'Reabre una tarea terminada si resulta que no estaba terminada.') },
      ],
    },
    {
      id: 'repeat',
      title: b('Tasks that repeat', 'Tareas que se repiten'),
      points: [
        b('Repeats: Every day, Every weekday (Mon–Fri), Every week, Every month on the same date, or Every month by weekday ("the 1st Tuesday", "the last Friday").', 'Se repite: Cada día, Cada día laboral (lun–vie), Cada semana, Cada mes en la misma fecha, o Cada mes por día de la semana ("el 1er martes", "el último viernes").'),
        b('When you finish a repeating task, the next one appears by itself.', 'Cuando terminas una tarea que se repite, la siguiente aparece sola.'),
        b('Nothing repeats for ever. Every repeat stops after a date — one month by default. When it ends, renew it if it still matters.', 'Nada se repite para siempre. Cada repetición termina en una fecha — un mes por defecto. Cuando termine, renuévala si todavía importa.'),
      ],
      callouts: [
        { tone: 'why', text: b('A list full of repeating tasks nobody does any more is a list nobody trusts. The month limit makes you decide again.', 'Una lista llena de tareas repetidas que ya nadie hace es una lista en la que nadie confía. El límite de un mes te hace decidir otra vez.') },
      ],
    },
    {
      id: 'reminders',
      title: b('Reminders', 'Recordatorios'),
      points: [
        b('A reminder arrives as a private chat message from TTMS. Email reminders are switched on or off by an admin for the whole company.', 'Un recordatorio llega como mensaje privado de TTMS en el chat. Los recordatorios por correo los enciende o apaga un administrador para toda la empresa.'),
        b('Choose how you get them beside the Calendar: Email (when allowed) and A private chat message. With both off, nothing is sent.', 'Elige cómo recibirlos junto al Calendario: Correo (si está permitido) y Mensaje privado en el chat. Con ambos apagados, no se envía nada.'),
        b('A finished task sends no reminders.', 'Una tarea terminada no manda recordatorios.'),
      ],
    },
    {
      id: 'work-blocks',
      title: b('Work blocks: time set aside for a task', 'Bloques de trabajo: tiempo reservado para una tarea'),
      points: [
        b('A big task needs time on the calendar, not just a deadline. In the editor, press Schedule a work block.', 'Una tarea grande necesita tiempo en el calendario, no solo una fecha límite. En el editor, presiona Programar un bloque de trabajo.'),
        b('A block is an event linked to the task. A task can have as many as it needs.', 'Un bloque es un evento enlazado a la tarea. Una tarea puede tener los que necesite.'),
        b('From any event you can also pick "Work block for" and choose the task — or make a new one.', 'Desde cualquier evento también puedes elegir "Bloque de trabajo para" y escoger la tarea — o crear una nueva.'),
      ],
    },
    {
      id: 'game',
      title: b('Game mode (optional)', 'Modo juego (opcional)'),
      intro: b('Turn on game mode if you like a scoreboard. It is private: nobody else ever sees your level or XP, and there is no leaderboard.', 'Activa el modo juego si te gusta un marcador. Es privado: nadie más ve tu nivel ni tu XP, y no hay tabla de posiciones.'),
      screen: 'tasks-game',
      steps: [
        { spot: 1, text: b('Your level, title and XP to the next level. Pick a theme: Freight brokerage (Trainee → Freight Hall of Famer), Wizarding, Empires, Fairy worlds, Outer space or Pirates.', 'Tu nivel, título y XP para el siguiente nivel. Elige un tema: Freight brokerage (Trainee → Freight Hall of Famer), Magos, Imperios, Mundos de hadas, Espacio o Piratas.') },
        { spot: 2, text: b('Missions: small daily and weekly goals that pay extra XP.', 'Misiones: metas pequeñas diarias y semanales que dan XP extra.') },
        { spot: 3, text: b('Difficulty sets what a task is worth: Trivial 5, Easy 15, Medium 30, Hard 60, Very hard 90, Epic 120 XP. Each step ticked adds 5.', 'La dificultad define lo que vale una tarea: Trivial 5, Fácil 15, Media 30, Difícil 60, Muy difícil 90, Épica 120 XP. Cada paso marcado suma 5.') },
      ],
      table: [
        [b('You earn', 'Ganas'), b('You lose', 'Pierdes')],
        [b('A finished task’s XP (less if late: 75% up to 3 days, 50% up to a week, then 25%)', 'El XP de una tarea terminada (menos si es tarde: 75% hasta 3 días, 50% hasta una semana, luego 25%)'), b('5 XP per weekday a task is overdue, up to its worth', '5 XP por día laboral que una tarea está vencida, hasta lo que vale')],
        [b('+50 XP for the first task or step of each working day', '+50 XP por la primera tarea o paso de cada día laboral'), b('25 XP per missed working day of a streak, up to 300', '25 XP por cada día laboral perdido de una racha, hasta 300')],
        [b('5 XP for each step', '5 XP por cada paso'), b('Half a task’s worth if you close it as Not done', 'La mitad de lo que vale una tarea si la cierras como No hecha')],
      ],
      callouts: [
        { tone: 'why', text: b('Your streak counts Monday to Friday only, and is frozen on Guatemalan holidays and on days you asked for time off — waiting or approved. A day off never breaks it.', 'Tu racha cuenta de lunes a viernes, y se congela en feriados de Guatemala y en días que pediste libres — pendientes o aprobados. Un día libre nunca la rompe.') },
      ],
    },
  ],
  faq: [
    { q: b('Can my manager see my tasks?', '¿Mi gerente puede ver mis tareas?'),
      a: b('No. Only a plan you choose to share (when you tick your planning Done) is shown to your manager, as a copy of titles and times — never whether you finished them.', 'No. Solo un plan que tú decides compartir (al marcar tu planificación como Hecha) lo ve tu gerente, como copia de títulos y horas — nunca si las terminaste.') },
    { q: b('I cleared my done tasks. Are they gone?', 'Limpié mis tareas hechas. ¿Se borraron?'),
      a: b('No, they are put away. You still see them on the Calendar on the day they were done.', 'No, se guardaron. Todavía las ves en el Calendario el día que se hicieron.') },
    { q: b('What is the difference between a task and an event?', '¿Cuál es la diferencia entre una tarea y un evento?'),
      a: b('A task is something to finish and goes on your list and board. An event is something at a time — a call, a meeting — and only shows on the calendar.', 'Una tarea es algo por terminar y va en tu lista y tablero. Un evento es algo a una hora — una llamada, una reunión — y solo aparece en el calendario.') },
  ],
  quiz: [
    { q: b('You will work on a quote Tuesday but the client needs it Thursday. Where does Thursday go?', 'Trabajarás una cotización el martes pero el cliente la necesita el jueves. ¿Dónde va el jueves?'),
      options: [b('Starts', 'Empieza'), b('Due by', 'Fecha límite'), b('Notes', 'Notas')],
      answer: 1, why: b('Starts is when you work on it; Due by is the deadline.', 'Empieza es cuándo trabajas; Fecha límite es el plazo.') },
    { q: b('A call you had planned did not happen and will not. What do you choose?', 'Una llamada planeada no pasó y no pasará. ¿Qué eliges?'),
      options: [b('Delete it', 'Borrarla'), b('Not done', 'No hecha'), b('Leave it open', 'Dejarla abierta')],
      answer: 1, why: b('Not done closes it honestly and keeps it on the calendar.', 'No hecha la cierra con honestidad y la deja en el calendario.') },
    { q: b('Who can see your task list?', '¿Quién puede ver tu lista de tareas?'),
      options: [b('Only you', 'Solo tú'), b('You and your manager', 'Tú y tu gerente'), b('All admins', 'Todos los administradores')],
      answer: 0, why: b('It is private. Only a plan you share is seen, as a copy.', 'Es privada. Solo un plan que compartes se ve, como copia.') },
  ],
};
