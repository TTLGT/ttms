/*
 * The Spanish for the Planner (2026-11-24) — the Today tab, the switch
 * between the Planner and the old pages, and Settings → Planner.
 *
 * The same rules as es.ts: keyed by the English exactly as shown (after
 * spanishKey() collapses the spacing and drops a final full stop), written by
 * hand, `tú` throughout, buttons as infinitives. The tour carries its own
 * Spanish beside the English (TODAY_TOUR in PlannerTour.tsx), like the
 * onboarding guides, so it is not repeated here.
 */

export const ES_PLANNER: Record<string, string> = {
  // ── Page and tabs ─────────────────────────────────────────────────────────
  'Planner': 'Planner',
  'Tasks': 'Tareas',
  'Only you can see your list': 'Solo tú puedes ver tu lista.',
  'Back to the old pages': 'Volver a las páginas anteriores',
  'Show me around this tab': 'Muéstrame esta pestaña',

  // ── Today ─────────────────────────────────────────────────────────────────
  'Good morning': 'Buenos días',
  'Good afternoon': 'Buenas tardes',
  'Good evening': 'Buenas noches',
  'Today’s 3': 'Tus 3 de hoy',
  "Today's 3": 'Tus 3 de hoy',
  'For today': 'Para hoy',
  'Meetings': 'Reuniones',
  'Pick another': 'Elegir otra',
  'Pick today’s 3': 'Elegir tus 3 de hoy',
  'Pick one': 'Elegir una',
  'What are the three things that matter most today?': '¿Cuáles son las tres cosas más importantes de hoy?',
  'All three done. Whatever you do next is a bonus': 'Las tres hechas. Lo que hagas ahora es extra.',
  'Inbox': 'Bandeja',
  'Tasks with no day yet. Give each one a day so it doesn’t get lost': 'Tareas que todavía no tienen día. Dale un día a cada una para que no se pierda.',
  'Nothing waiting. Everything you’ve written down has a day': 'Nada pendiente. Todo lo que anotaste tiene día.',
  'Tomorrow': 'Mañana',
  'Your day': 'Tu día',
  'Not a working day': 'No es día laboral',
  'Nothing with a time today. Give a task a time and it shows here': 'Nada con hora hoy. Ponle hora a una tarea y aparece aquí.',
  'Late and due today': 'Atrasadas y para hoy',
  'This week': 'Esta semana',
  'No day yet': 'Todavía sin día',
  'Find a task': 'Buscar una tarea',
  'Mark done': 'Marcar como hecha',
  'Mark not done': 'Marcar como no hecha',
  'Take out of Today\'s 3': 'Quitar de tus 3 de hoy',
  'Urgent': 'Urgente',
  'Due today': 'Vence hoy',
  'Add a task: “Call Rio Grande tomorrow 3pm !urgent”': 'Agrega una tarea: “Llamar a Rio Grande mañana a las 3 !urgente”',
  'Quick add a task': 'Agregar una tarea rápido',

  // ── The switch ────────────────────────────────────────────────────────────
  'Try the new Planner': 'Prueba el nuevo Planner',
  'Try it': 'Probarlo',
  'Your day, tasks and calendar in one place. Same tasks — you can come back here any time':
    'Tu día, tus tareas y tu calendario en un solo lugar. Las mismas tareas: puedes volver aquí cuando quieras.',
  'You’ll have My tasks and the Calendar again, with every task exactly as it is. You can come back to the Planner any time':
    'Volverás a tener Mis tareas y el Calendario, con cada tarea tal como está. Puedes regresar al Planner cuando quieras.',
  'Stay on the Planner': 'Quedarme en el Planner',
  'Go back': 'Volver',

  // ── Settings → Planner ────────────────────────────────────────────────────
  'Who has the new Planner': 'Quién tiene el nuevo Planner',
  'Who has the new Planner while it is being tried, a few people at a time': 'Quién tiene el nuevo Planner mientras se prueba, unas pocas personas a la vez.',
  'Planner rollout': 'Lanzamiento del Planner',
  'Nobody yet': 'Nadie todavía',
  'People I choose': 'Las personas que elijo',
  'Anyone who wants it': 'Quien lo quiera',
  'Everyone': 'Todos',
  'Everyone keeps My tasks and the Calendar exactly as they are': 'Todos conservan Mis tareas y el Calendario tal como están.',
  'Only the people you pick below have the Planner. They can go back to the old pages themselves, one click each way':
    'Solo las personas que elijas abajo tienen el Planner. Pueden volver a las páginas anteriores por su cuenta, con un clic en cada sentido.',
  'Everybody sees “Try the new Planner” on My tasks and the Calendar and can switch back. The people you pick start on it':
    'Todos ven “Prueba el nuevo Planner” en Mis tareas y el Calendario y pueden volver. Las personas que elijas empiezan con él.',
  'The switch disappears: everybody has the Planner, and the old My tasks and Calendar links open its tabs':
    'El cambio desaparece: todos tienen el Planner, y los enlaces de Mis tareas y del Calendario abren sus pestañas.',
  'People chosen': 'Personas elegidas',
  'Add a person by name or email': 'Agregar a una persona por nombre o email',

  // ── The planning pop-up (step 2) ──────────────────────────────────────────
  'Plan your day': 'Planea tu día',
  'Plan your day · about 1 minute': 'Planea tu día · como 1 minuto',
  'Plan now': 'Planear ahora',
  'Finish my plan': 'Terminar mi plan',
  'Your list, plus what TTMS found waiting on you today': 'Tu lista, más lo que TTMS encontró esperándote hoy.',
  'Pick the three things that matter most today': 'Elige las tres cosas más importantes de hoy.',
  'On your list': 'En tu lista',
  'Found in your loads': 'Encontrado en tus cargas',
  'Clients to call': 'Clientes a llamar',
  'Your own': 'Tuyas',
  'Waiting on you': 'Esperándote',
  'Your onboarding': 'Tu inducción',
  'Something else?': '¿Algo más?',
  'Type it and press Add': 'Escríbelo y presiona Agregar',
  'Nothing is due today on your list, and TTMS found nothing waiting on you. What are the three things that matter most today?':
    'No tienes nada para hoy en tu lista y TTMS no encontró nada esperándote. ¿Cuáles son las tres cosas más importantes de hoy?',
  'You’ve put this off twice. Plan just one thing to get back to work': 'Ya lo pospusiste dos veces. Planea una sola cosa para volver al trabajo.',
  'Just one thing · 30 sec': 'Solo una cosa · 30 seg',
  'I’m off today': 'Hoy no trabajo',
  'Plan my whole day': 'Planear todo mi día',
  'Pick at least one': 'Elige al menos una',
  'Think it through': 'Piénsalo bien',
  'A few questions to catch what isn’t on your list. Tap anything to add it to today':
    'Unas preguntas para encontrar lo que no está en tu lista. Toca cualquier cosa para agregarla a hoy.',
  'Anything else on your mind?': '¿Algo más en mente?',
  'Next: block my time': 'Siguiente: reservar mi tiempo',
  'When will you do them?': '¿Cuándo las vas a hacer?',
  'Fitted into the free time between your meetings. Change any of them':
    'Acomodadas en el tiempo libre entre tus reuniones. Cambia la que quieras.',
  'No set time': 'Sin hora',
  'Also today, between blocks': 'También hoy, entre bloques',
  'Each of your 3 gets half an hour in the free time between your meetings. Drag them on the Calendar later if the day changes':
    'Cada una de tus 3 recibe media hora en el tiempo libre entre tus reuniones. Muévelas en el Calendario si el día cambia.',
  'No working hours are set for today, so pick times yourself or leave them without one':
    'No hay horario de trabajo para hoy, así que elige tú las horas o déjalas sin hora.',
  'Looks good': 'Se ve bien',
  'Share it with your manager': 'Compártelo con tu jefe',
  'This is what they will see': 'Esto es lo que verá.',
  'Your manager (and admins) see the names and times above — everything on your day, not only your 3. Notes, steps, contacts and whether you finish them stay private. Mark anything personal as Busy on the Calendar':
    'Tu jefe (y los administradores) ven los nombres y las horas de arriba: todo lo de tu día, no solo tus 3. Las notas, los pasos, los contactos y si las terminas siguen siendo privados. Marca como Ocupado en el Calendario lo que sea personal.',
  'One is enough to get back to work. A bar stays at the top until you add the other two on Today':
    'Con una basta para volver al trabajo. Una barra se queda arriba hasta que agregues las otras dos en Hoy.',
  'Keep it to myself': 'Guardármelo',
  'Share my plan': 'Compartir mi plan',
  'Good start': 'Buen comienzo',
  'Day planned': 'Día planeado',
  'Whole day planned': 'Todo el día planeado',
  'Your manager can see it now': 'Tu jefe ya puede verlo.',
  'Kept to yourself. You can share it later from the Calendar': 'Solo para ti. Puedes compartirlo después desde el Calendario.',
  'Back to work': 'Volver al trabajo',
  'Not working today?': '¿No trabajas hoy?',
  'Off today?': '¿Hoy no trabajas?',
  'No time off is on record for you today, so TTMS will ask again tomorrow. If you are working, planning takes about a minute':
    'No hay tiempo libre registrado para ti hoy, así que TTMS te volverá a preguntar mañana. Si estás trabajando, planear toma como un minuto.',
  'Close for today': 'Cerrar por hoy',
  'Looking through your list and your loads…': 'Revisando tu lista y tus cargas…',
  'Close the day': 'Cerrar el día',
  'How did today go?': '¿Cómo te fue hoy?',
  'Tick what got done and move the rest, so tomorrow starts clean': 'Marca lo que quedó hecho y mueve lo demás, para empezar mañana limpio.',
  'Day closed': 'Día cerrado',
  'See you tomorrow': 'Nos vemos mañana.',
  'Today’s 3 done': 'Tus 3 de hoy hechas',
  'Done today': 'Hechas hoy',
  'Moved to tomorrow': 'Movidas a mañana',
  'Still open': 'Todavía abiertas',
  'Not today': 'Hoy no',
  'Close my day': 'Cerrar mi día',
  'Plan next week': 'Planear la próxima semana',
  'Monday': 'Lunes',
  'Moved to Monday': 'Movida al lunes',
  'Plan my day': 'Planear mi día',
  'You haven’t planned today yet': 'Todavía no has planeado hoy',
  'It takes about a minute': 'Toma como un minuto.',
};
