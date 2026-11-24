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
};
