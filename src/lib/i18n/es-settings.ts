/*
 * The Spanish for the Settings redesign (2026-11-23) — the side menu, the
 * Save bar, the page titles and blurbs, the previews and the change log.
 *
 * The same rules as es.ts: keyed by the English exactly as shown (after
 * spanishKey() collapses the spacing and drops a final full stop), written by
 * hand, `tú` throughout, buttons as infinitives. Kept in its own file because
 * Settings is one screen family and is easier to keep in step this way. es.ts
 * merges it between es-more.ts and its own entries.
 */

export const ES_SETTINGS: Record<string, string> = {
  // ── Menu, groups, pages ──────────────────────────────────────────────────
  'Home': 'Inicio',
  'People & access': 'Personas y acceso',
  'Company': 'Empresa',
  'Sales & orders': 'Ventas y órdenes',
  'Team life': 'Vida del equipo',
  'Data & history': 'Datos e historial',
  'Invite people': 'Invitar personas',
  'Who can do what': 'Quién puede hacer qué',
  'Removed people': 'Personas retiradas',
  'Access history': 'Historial de acceso',
  'General': 'General',
  'Security': 'Seguridad',
  'Work groups': 'Grupos de trabajo',
  'Quote rates': 'Tarifas de cotización',
  'Payment terms': 'Condiciones de pago',
  'Lane distance': 'Distancia de la ruta',
  'Agreement terms': 'Condiciones del acuerdo',
  'Lead sources': 'Orígenes de clientes',
  'Work schedules': 'Horarios de trabajo',
  'Lunch and breaks': 'Almuerzo y descansos',
  'Office network': 'Red de la oficina',
  'BATS import': 'Importación de BATS',
  'Change log': 'Registro de cambios',
  'All settings': 'Toda la configuración',
  'All people': 'Todas las personas',
  'Back to People': 'Volver a Personas',
  'View': 'Ver',
  'View only': 'Solo lectura',
  'Needs a look — see Home': 'Necesita revisión: mira Inicio',
  'See history': 'Ver historial',
  'See it as another role': 'Verlo como otro rol',
  'See the menu as': 'Ver el menú como',
  'The menu as {role} sees it': 'El menú como lo ve {role}',
  'Pages still open as you. People given extra permissions one at a time may see more':
    'Las páginas se siguen abriendo como tú. Quien tenga permisos extra dados uno por uno puede ver más.',
  'Back to my menu': 'Volver a mi menú',
  'You see {n} of {total} settings pages. Ask an admin if you need one of the others':
    'Ves {n} de {total} páginas de configuración. Pide a un administrador si necesitas alguna de las otras.',
  'Search settings and people': 'Buscar en configuración y personas',
  'Opens the page with this ready to save': 'Abre la página con esto listo para guardar',

  // Page blurbs
  'What each setting you look after is set to, and anything that needs a look':
    'Cómo está cada configuración a tu cargo, y lo que necesita revisión.',
  'Everyone who can sign in, their details, and what each of them is allowed to do':
    'Todas las personas que pueden iniciar sesión, sus datos y lo que cada una puede hacer.',
  'Give someone new access, one at a time or from a spreadsheet':
    'Da acceso a alguien nuevo, uno por uno o desde una hoja de cálculo.',
  'Every permission against every person — or one person in plain words, or two side by side':
    'Cada permiso frente a cada persona, o una persona en palabras simples, o dos lado a lado.',
  'Everyone whose access was taken away, who did it, and putting them back':
    'Todas las personas a quienes se les quitó el acceso, quién lo hizo, y cómo devolverlo.',
  'Every addition, removal, restore and email change, in order':
    'Cada alta, baja, regreso y cambio de correo, en orden.',
  'How dates are written, whether chat shows who is online, and whether reminders can be emailed':
    'Cómo se escriben las fechas, si el chat muestra quién está en línea y si los recordatorios pueden ir por correo.',
  'When TTMS signs a browser out by itself — after so long unused, and every so many days':
    'Cuándo TTMS cierra la sesión de un navegador por sí solo: tras un tiempo sin uso y cada cierto número de días.',
  'The offices people work from': 'Las oficinas desde donde trabaja la gente.',
  'Who reports to whom. A Sales Manager also runs the people on the team they lead':
    'Quién le reporta a quién. Un Gerente de ventas además dirige a las personas del equipo que lidera.',
  'Who can see whose clients and loads. This one grants access':
    'Quién puede ver los clientes y cargas de quién. Esto sí da acceso.',
  'What the quote calculator charges per mile for each truck, how big a load each takes, and the market check':
    'Lo que la calculadora cobra por milla para cada camión, qué tan grande es la carga que lleva cada uno, y la comparación con el mercado.',
  'How clients pay us, how carriers are paid and when our fee is collected, with any fee each carries':
    'Cómo nos pagan los clientes, cómo se paga a los transportistas y cuándo se cobra nuestra comisión, con el cargo que tenga cada opción.',
  'How order mileage is worked out — a free estimate, or Google, which is billed per lookup':
    'Cómo se calcula el millaje de una orden: una estimación gratis, o Google, que cobra por cada consulta.',
  'The terms clients and carriers accept when they sign the SA or the Dispatch Sheet':
    'Las condiciones que aceptan clientes y transportistas al firmar el SA o la Hoja de despacho.',
  'Where new clients come from, as offered on the client form':
    'De dónde vienen los clientes nuevos, como se ofrece en el formulario de cliente.',
  'The birthday and work-anniversary message in the Everyone room, and its wording':
    'El mensaje de cumpleaños y aniversario laboral en la sala de Todos, y su texto.',
  'When each person is expected to work, and the company default':
    'Cuándo se espera que trabaje cada persona, y el horario de la empresa.',
  'Public holidays in Guatemala and the US, and any moved or added':
    'Los feriados de Guatemala y EE. UU., y los que se movieron o agregaron.',
  'Lunch times, the clock-in and break reminders, and Back on time':
    'Horarios de almuerzo, los recordatorios de entrada y de descanso, y De regreso a tiempo.',
  'Which internet address is the office, and the “not in yet” alerts':
    'Qué dirección de internet es la oficina, y las alertas de “todavía no ha llegado”.',
  'Bring carriers, customers and orders across from BATS':
    'Trae transportistas, clientes y órdenes desde BATS.',
  'Every change to a company setting: who, when, and what it was before':
    'Cada cambio a una configuración de la empresa: quién, cuándo y cómo estaba antes.',

  // Risk chips
  'Grants access': 'Da acceso',
  'Can sign people out': 'Puede cerrar sesiones',
  'Can cost money': 'Puede costar dinero',
  'Legal wording': 'Texto legal',

  // ── Save bar ─────────────────────────────────────────────────────────────
  'You have unsaved changes': 'Tienes cambios sin guardar',
  'Unsaved changes': 'Cambios sin guardar',
  'Put back as it was': 'Se dejó como estaba',
  'Leave without saving?': '¿Salir sin guardar?',
  'Leave without saving': 'Salir sin guardar',
  'You changed something on this page and have not saved it. If you leave now, the change is lost':
    'Cambiaste algo en esta página y no lo has guardado. Si sales ahora, el cambio se pierde.',
  'Stay here': 'Quedarme aquí',
  'Save and leave': 'Guardar y salir',
  'Not saved yet': 'Sin guardar',

  // ── Home ─────────────────────────────────────────────────────────────────
  'Needs a look': 'Necesita revisión',
  'At a glance': 'De un vistazo',
  'Recent changes': 'Cambios recientes',
  'Company setup': 'Configuración de la empresa',
  'Everything is set up. Nice work': 'Todo está configurado. Buen trabajo.',
  'Add the offices': 'Agregar las oficinas',
  'Set up the teams': 'Armar los equipos',
  'Fill in the payment terms': 'Llenar las condiciones de pago',
  'Save the quote rates': 'Guardar las tarifas de cotización',
  'Add the lead sources': 'Agregar los orígenes de clientes',
  'Save a company work schedule': 'Guardar un horario de la empresa',
  'Add the office network': 'Agregar la red de la oficina',
  'Decide whether reminders may be emailed': 'Decidir si los recordatorios pueden ir por correo',
  'Lane distance is on Google Routes, which is billed for every new lane looked up':
    'La distancia de la ruta usa Google Routes, que cobra por cada ruta nueva que se consulta.',
  'Lane distance is set to Google, but no Google key is on the server, so orders fall back to the estimate':
    'La distancia de la ruta está en Google, pero no hay clave de Google en el servidor, así que las órdenes usan la estimación.',
  'Nobody has decided yet whether calendar reminders may go out by email. They are off until somebody does':
    'Nadie ha decidido todavía si los recordatorios del calendario pueden ir por correo. Están apagados hasta que alguien lo haga.',
  'There is no company work schedule yet, so nobody is marked late or absent':
    'Todavía no hay horario de la empresa, así que nadie aparece como tarde o ausente.',
  'No office network is set, so no clock-in is marked as from the office':
    'No hay red de la oficina, así que ninguna entrada se marca como hecha desde la oficina.',
  'The quote calculator is still on the starting rates from the old Google Sheet':
    'La calculadora sigue con las tarifas iniciales de la antigua hoja de Google.',

  // ── General ──────────────────────────────────────────────────────────────
  'Date format': 'Formato de fecha',
  'How dates are written everywhere in TTMS — pickup and delivery dates, insurance expiry, start dates and birthdays. Every example shows the same day, the 4th of March 2020':
    'Cómo se escriben las fechas en todo TTMS: recogida y entrega, vencimiento del seguro, fechas de inicio y cumpleaños. Todos los ejemplos muestran el mismo día, el 4 de marzo de 2020.',
  'How a load reads': 'Cómo se lee una carga',
  'An example load, drawn in the format picked on the left. Nothing here is saved until you press Save':
    'Una carga de ejemplo, en el formato elegido a la izquierda. Nada se guarda hasta que presiones Guardar.',
  'Insurance until': 'Seguro hasta',
  'On the BOL': 'En el BOL',
  'Typing a date follows this too — every date box in TTMS shows and accepts the format chosen here, and the calendar button beside it still opens the usual picker for clicking':
    'Escribir una fecha también sigue esto: cada casilla de fecha en TTMS muestra y acepta el formato elegido aquí, y el botón de calendario a su lado sigue abriendo el selector de siempre.',
  'Online status': 'Estado en línea',
  'Shows Online, Away or Last seen at the top of a one-on-one chat. Each person’s browser checks in at most once every five minutes while they are using TTMS — or clocked in — so “last seen” can be up to five minutes behind':
    'Muestra En línea, Ausente o Última vez arriba de un chat uno a uno. El navegador de cada persona se reporta como mucho una vez cada cinco minutos mientras usa TTMS (o tiene marcada su entrada), así que “última vez” puede ir hasta cinco minutos atrasado.',
  'The top of a chat': 'La parte de arriba de un chat',
  'An example conversation. Nothing here is saved until you press Save':
    'Una conversación de ejemplo. Nada se guarda hasta que presiones Guardar.',
  'Reminder emails': 'Correos de recordatorio',
  'How a reminder arrives': 'Cómo llega un recordatorio',
  'An example reminder. Nothing here is saved until you press Save':
    'Un recordatorio de ejemplo. Nada se guarda hasta que presiones Guardar.',
  'In TTMS chat': 'En el chat de TTMS',
  'By email, for whoever ticked it': 'Por correo, para quien lo marcó',
  'No email is sent': 'No se envía ningún correo',

  // ── Security ─────────────────────────────────────────────────────────────
  'Sign out after this long unused': 'Cerrar sesión tras este tiempo sin uso',
  'Sign in again every': 'Volver a iniciar sesión cada',
  'However busy somebody is. They get five minutes’ warning to save their work':
    'Sin importar qué tan ocupada esté la persona. Recibe un aviso cinco minutos antes para guardar su trabajo.',
  'This is short': 'Esto es poco tiempo',
  'A working day': 'Un día de trabajo',
  'An example day: in at 7:00, last touches TTMS at 12:00 and goes to lunch. Nothing here is saved until you press Save':
    'Un día de ejemplo: entra a las 7:00, usa TTMS por última vez a las 12:00 y se va a almorzar. Nada se guarda hasta que presiones Guardar.',
  'Away from desk': 'Lejos del escritorio',
  'Signed out': 'Sesión cerrada',
  'A warning at {warn}, and signed out at {out} unless they click Stay signed in':
    'Un aviso a las {warn}, y la sesión se cierra a las {out} a menos que haga clic en Seguir conectado.',
  'Still signed in at the end of the day — the sign-out would come at {time}':
    'Sigue conectado al final del día: el cierre de sesión llegaría a las {time}.',
  'Nobody is signed out for being away. A computer left unlocked stays signed in':
    'A nadie se le cierra la sesión por estar ausente. Una computadora desbloqueada sigue conectada.',
  'Nobody is asked to sign in again on a schedule': 'A nadie se le pide volver a iniciar sesión según un calendario.',
  'Somebody who signs in on Monday morning is asked to sign in again {when} later, with five minutes’ warning':
    'Quien inicia sesión el lunes en la mañana debe volver a iniciarla {when} después, con cinco minutos de aviso.',
  'A sign-out never clocks anybody out. It applies to each person from their next page load':
    'Cerrar sesión nunca marca la salida de nadie. Aplica a cada persona desde la próxima vez que cargue una página.',

  // ── Lane distance ────────────────────────────────────────────────────────
  'Estimate': 'Estimación',
  'Free': 'Gratis',
  'Billed': 'Con cobro',
  'Google Routes': 'Google Routes',
  'Real road miles from Google. Google charges for every lane it has not been asked about before, so on this setting the order shows a button and works the distance out only when somebody asks for it. A lane already paid for is reused for nothing, on every later order. If Google is ever unreachable, orders fall back to the free estimate and say so':
    'Millas reales por carretera, de Google. Google cobra cada ruta que no se le ha consultado antes, así que con esta opción la orden muestra un botón y calcula la distancia solo cuando alguien lo pide. Una ruta ya pagada se reutiliza gratis en todas las órdenes siguientes. Si Google no responde, las órdenes usan la estimación gratis y lo indican.',
  'This starts a bill': 'Esto empieza a generar cobros',
  'What would it cost?': '¿Cuánto costaría?',
  'Worked out here from the numbers you type. It never asks Google anything, so trying numbers costs nothing':
    'Se calcula aquí con los números que escribes. Nunca le pregunta nada a Google, así que probar números no cuesta nada.',
  'New lanes a month': 'Rutas nuevas al mes',
  'Pickup-and-delivery pairs nobody has looked up before. Repeat lanes are free':
    'Pares de recogida y entrega que nadie ha consultado antes. Las rutas repetidas son gratis.',
  'Google’s price per 1,000 lookups': 'Precio de Google por 1,000 consultas',
  'Google’s list price to start with. Check this account’s billing page for its real price and any free monthly allowance':
    'Para empezar, el precio de lista de Google. Revisa la página de facturación de esta cuenta para ver su precio real y cualquier uso gratis mensual.',
  'Per month': 'Por mes',
  'About 5% off the real distance, more on mountain lanes': 'Alrededor de 5% de diferencia con la distancia real, más en rutas de montaña.',
  'About {year} a year, before any free allowance': 'Alrededor de {year} al año, antes de cualquier uso gratis.',

  // ── Payment terms ────────────────────────────────────────────────────────
  'Client payment method': 'Método de pago del cliente',
  'Carrier pay terms': 'Condiciones de pago al transportista',
  'Broker fee terms': 'Condiciones de la comisión',
  'How the client pays us': 'Cómo nos paga el cliente.',
  'How and when the carrier is paid': 'Cómo y cuándo se le paga al transportista.',
  'When our fee is collected': 'Cuándo se cobra nuestra comisión.',
  'On a $2,000 load': 'En una carga de $2,000',
  'An example load: the client pays $2,000, the carrier gets $1,700 and our fee is $300. Uses what is typed, saved or not':
    'Una carga de ejemplo: el cliente paga $2,000, el transportista recibe $1,700 y nuestra comisión es $300. Usa lo que está escrito, guardado o no.',
  'No options yet': 'Todavía no hay opciones',
  'Until one is added, the order form has nothing to offer here':
    'Hasta que se agregue una, el formulario de orden no tiene nada que ofrecer aquí.',
  'Add an option': 'Agregar una opción',

  // ── Quote rates ──────────────────────────────────────────────────────────
  'Changes reach every broker the next time they open the calculator':
    'Los cambios les llegan a todos los brokers la próxima vez que abran la calculadora.',
  'What these rates quote': 'Lo que cotizan estas tarifas',
  'Example lanes, full truckload, the middle of each range. Green and red show the change from what is saved now. Nothing here is saved until you press Save':
    'Rutas de ejemplo, carga completa, a la mitad de cada rango. Verde y rojo muestran el cambio frente a lo que está guardado. Nada se guarda hasta que presiones Guardar.',
  'Starting rates': 'Tarifas iniciales',
  'Put back the starting rates?': '¿Volver a las tarifas iniciales?',
  'Every rate goes back to the starting rates from the old Google Sheet. Nothing is saved until you press Save, and Discard brings back what you had':
    'Cada tarifa vuelve a las tarifas iniciales de la antigua hoja de Google. Nada se guarda hasta que presiones Guardar, y Descartar devuelve lo que tenías.',
  'Put them back': 'Devolverlas',

  // ── Agreement terms ──────────────────────────────────────────────────────
  'The change, as the signer will read it': 'El cambio, como lo leerá quien firma',
  '{added} words added, {removed} taken out. Green is new; red is what goes':
    '{added} palabras agregadas, {removed} quitadas. Lo verde es nuevo; lo rojo es lo que se va.',
  'No wording has changed': 'El texto no ha cambiado.',
  'Pressing Save sends your change to an admin to approve. Nothing changes until they do':
    'Al presionar Guardar, tu cambio se envía a un administrador para que lo apruebe. Nada cambia hasta que lo haga.',
  'Compare wording': 'Comparar texto',

  // ── Lead sources, sites, teams, work groups ──────────────────────────────
  'Brokers pick from this list rather than typing it, so the same source is spelled one way and totals up correctly. Importing from BATS adds any source it finds that is not here yet':
    'Los brokers eligen de esta lista en vez de escribirlo, así un mismo origen se escribe de una sola forma y los totales cuadran. Importar desde BATS agrega cualquier origen que encuentre y que todavía no esté aquí.',
  'No lead sources yet': 'Todavía no hay orígenes',
  'Add one and it becomes selectable on orders and clients':
    'Agrega uno y se podrá elegir en órdenes y clientes.',
  'Retired ({n})': 'Retirados ({n})',
  'Save the new name': 'Guardar el nombre nuevo',
  'This only works if no order or client is using it. If any are, retire it instead — they keep their source and it leaves the pickers':
    'Esto solo funciona si ninguna orden o cliente lo usa. Si alguno lo usa, retíralo: conservan su origen y deja de aparecer en las listas.',
  'Delete it': 'Eliminarlo',
  'Assigning someone to a site records where they sit — it does not change what they can see. People are given a site on their own page under People':
    'Asignar a alguien a un sitio registra dónde trabaja; no cambia lo que puede ver. A cada persona se le da un sitio en su propia página, en Personas.',
  'No sites yet': 'Todavía no hay sitios',
  'Add the first office above and it can be given to people on their page':
    'Agrega la primera oficina arriba y se podrá asignar a las personas en su página.',
  'Anyone assigned to this site will be left without one. Their access does not change':
    'Quien esté asignado a este sitio quedará sin uno. Su acceso no cambia.',
  'Delete the site': 'Eliminar el sitio',
  'Everyone on a team reports to its lead. A team often lines up with one office, but it does not have to. For anybody but a Sales Manager, a team changes nothing about what people can see — sharing records is what Work groups are for':
    'Todos en un equipo le reportan a su líder. Un equipo suele coincidir con una oficina, pero no tiene que ser así. Salvo para un Gerente de ventas, un equipo no cambia lo que la gente puede ver: para compartir registros están los Grupos de trabajo.',
  'Org chart': 'Organigrama',
  'No teams yet': 'Todavía no hay equipos',
  'Add the first team above. People are put on a team from their page, or by dragging them in the org chart':
    'Agrega el primer equipo arriba. Las personas se ponen en un equipo desde su página, o arrastrándolas en el organigrama.',
  'Anyone on this team will be left without one. If a Sales Manager leads it, they stop managing those people':
    'Quien esté en este equipo quedará sin uno. Si lo lidera un Gerente de ventas, deja de dirigir a esas personas.',
  'Delete the team': 'Eliminar el equipo',
  'Drag a person onto another team, or use Move to on their card. You are asked before anything changes':
    'Arrastra a una persona a otro equipo, o usa Mover a en su tarjeta. Se te pregunta antes de cambiar nada.',
  'No team': 'Sin equipo',
  'Drop someone here': 'Suelta a alguien aquí',
  'Move to another team': 'Mover a otro equipo',
  'Move them': 'Moverla',
  'Give a client, shipper, consignee or load to a group and everyone in it can see and use it. People who have not signed in yet can be added now — they see the group’s records the first time they sign in':
    'Asigna un cliente, remitente, destinatario o carga a un grupo y todos en él pueden verlo y usarlo. Puedes agregar ya a quien todavía no ha iniciado sesión: verá los registros del grupo la primera vez que entre.',
  'Circles': 'Círculos',
  'No work groups yet': 'Todavía no hay grupos de trabajo',
  'A group lets several people share the same clients and loads':
    'Un grupo permite que varias personas compartan los mismos clientes y cargas.',
  'What this changes': 'Lo que esto cambia',
  'Tick or untick people to see what they would gain or lose':
    'Marca o desmarca personas para ver qué ganarían o perderían.',
  'Will now see the {clients} clients, shippers and consignees and up to {loads} loads this group owns':
    'Ahora verá los {clients} clientes, remitentes y destinatarios, y hasta {loads} cargas, de este grupo.',
  'Will now see everything this group owns': 'Ahora verá todo lo que pertenece a este grupo.',
  'Stop seeing this group’s records — unless they own them, or reach them another way':
    'Deja de ver los registros de este grupo, salvo que sean suyos o llegue a ellos de otra forma.',
  'Any client, shipper, consignee or load owned by this group is detached from it. A load left with no owner is visible only to admin, dispatch and finance':
    'Todo cliente, remitente, destinatario o carga de este grupo queda separado de él. Una carga sin dueño solo la ven administración, despacho y finanzas.',
  'Delete the group': 'Eliminar el grupo',
  'Nobody yet': 'Nadie todavía',

  // ── Celebrations ─────────────────────────────────────────────────────────
  'Post the message': 'Publicar el mensaje',
  'A message in the Everyone room at 8am Guatemala time, on the day, naming whoever has a birthday or a work anniversary. It is signed Total Transport Logistics, and never carries a date of birth, a birth year or an age':
    'Un mensaje en la sala de Todos a las 8am hora de Guatemala, ese mismo día, nombrando a quien cumple años o aniversario laboral. Lo firma Total Transport Logistics y nunca lleva fecha de nacimiento, año de nacimiento ni edad.',
  'How it will look': 'Cómo se verá',
  'Made-up names, with the wording as it is typed now. Nothing here is saved until you press Save':
    'Nombres inventados, con el texto tal como está escrito ahora. Nada se guarda hasta que presiones Guardar.',
  'Who’s next': 'Quién sigue',
  'Nobody in the next few weeks': 'Nadie en las próximas semanas.',
  'The message is switched off, so none of these will be posted':
    'El mensaje está apagado, así que no se publicará ninguno de estos.',
  'Back to the standard wording': 'Volver al texto estándar',

  // ── Attendance ───────────────────────────────────────────────────────────
  'The day, with its reminders': 'El día, con sus recordatorios',
  'Drag a reminder along the day to move it; its length stays the same. Nothing is saved until you press Save':
    'Arrastra un recordatorio a lo largo del día para moverlo; su duración no cambia. Nada se guarda hasta que presiones Guardar.',
  'No reminders are switched on': 'No hay recordatorios encendidos.',
  'Year': 'Año',
  'Click a holiday to move it, or any other day to add a company day off there':
    'Haz clic en un feriado para moverlo, o en cualquier otro día para agregar ahí un día libre de la empresa.',
  'Who moves': 'Quién se mueve',
  'Nobody yet. Choose the people to move': 'Nadie todavía. Elige a las personas que se mueven.',

  // ── People ───────────────────────────────────────────────────────────────
  'Click anybody to see and change their details, roles and permissions. Everyone is a Broker unless they are given a role':
    'Haz clic en cualquiera para ver y cambiar sus datos, roles y permisos. Todos son Broker a menos que se les dé un rol.',
  'Everyone who can sign in, with the details on file for them — including payroll details nobody outside this page can see. Changing any of it is an admin job':
    'Todas las personas que pueden iniciar sesión, con sus datos registrados, incluidos datos de nómina que nadie fuera de esta página puede ver. Cambiarlos es trabajo de un administrador.',
  'Nobody has access yet': 'Nadie tiene acceso todavía',
  'Invite the first person and they appear here': 'Invita a la primera persona y aparecerá aquí.',
  'Open': 'Abrir',
  'Nobody here': 'No hay nadie aquí',
  'Details': 'Datos',
  'Roles & permissions': 'Roles y permisos',
  'Team & groups': 'Equipo y grupos',
  'Their details': 'Sus datos',
  'Full legal name, date of birth and personal email are seen by admins and HR only — they are never copied onto the profile the rest of the company reads':
    'El nombre legal completo, la fecha de nacimiento y el correo personal solo los ven administración y RR. HH.; nunca se copian al perfil que lee el resto de la empresa.',
  'Photo': 'Foto',
  'Saved as soon as it is chosen — it is a picture, not a setting':
    'Se guarda en cuanto se elige: es una foto, no una configuración.',
  'Work email': 'Correo de trabajo',
  'The address they sign in with. Their attendance, schedule, team and anything assigned to them move with it. Someone already signed in is signed out and signs in again with the new address — rename them in Google Workspace first':
    'La dirección con la que inicia sesión. Su asistencia, horario, equipo y todo lo que tenga asignado se mueven con ella. A quien ya inició sesión se le cierra y vuelve a entrar con la nueva dirección; cámbiale el nombre en Google Workspace primero.',
  'Change email': 'Cambiar correo',
  'Change it': 'Cambiarlo',
  'Roles': 'Roles',
  'Extra permissions': 'Permisos extra',
  'Smaller than a role: one ability, on top of what their roles give. A padlock means a role already gives it — change the role to take it away':
    'Más pequeño que un rol: una sola capacidad, además de lo que dan sus roles. Un candado significa que ya la da un rol; cambia el rol para quitarla.',
  'Access': 'Acceso',
  'Suspending blocks sign-in but keeps everything, so it can be undone. Removing takes them off the list; the removal log keeps their details and can put them back':
    'Suspender bloquea el inicio de sesión pero conserva todo, así que se puede deshacer. Retirar lo saca de la lista; el registro de retiros guarda sus datos y puede devolverlo.',
  'Suspend': 'Suspender',
  'Restore access': 'Devolver el acceso',
  'Remove from TTMS': 'Retirar de TTMS',
  'Remove them': 'Retirarlo',
  'They are signed out immediately and cannot sign in again unless they are put back from Removed people, which keeps their details, roles and photo':
    'Se le cierra la sesión de inmediato y no puede volver a entrar a menos que lo devuelvas desde Personas retiradas, que guarda sus datos, roles y foto.',
  'What they will be able to do': 'Lo que podrá hacer',
  'Team and office': 'Equipo y oficina',
  'Who they work with': 'Con quién trabaja',
  'Nobody else is on their team': 'No hay nadie más en su equipo.',
  'Groups share clients and loads between their members. Change who is in them on the Work groups page':
    'Los grupos comparten clientes y cargas entre sus miembros. Cambia quién está en ellos en la página Grupos de trabajo.',
  'Not in any work group': 'No está en ningún grupo de trabajo.',
  'Open Work groups': 'Abrir Grupos de trabajo',
  'The default — their own clients and loads': 'Lo predeterminado: sus propios clientes y cargas',

  // Ability list
  '{who} will be able to do {n} of {total} things': '{who} podrá hacer {n} de {total} cosas.',
  '{n} of them are sensitive': '{n} de ellas son delicadas.',
  'This change adds {added} and takes away {removed}': 'Este cambio agrega {added} y quita {removed}.',
  'What they cannot do ({n})': 'Lo que no puede hacer ({n})',
  'Sensitive': 'Delicado',
  'Comes with their role': 'Viene con su rol',
  'Taken away': 'Se quita',

  // Removed, history
  'Removing someone deletes their entry — this log is the only record that they were ever here, and the one place to put them back with everything they had':
    'Retirar a alguien borra su registro: este historial es la única prueba de que estuvo aquí, y el único lugar para devolverlo con todo lo que tenía.',
  'Nobody has been removed yet': 'Todavía no se ha retirado a nadie',
  'They can sign in as soon as you say yes, with everything below exactly as it was when they were removed':
    'Puede iniciar sesión en cuanto digas que sí, con todo lo de abajo tal como estaba cuando se le retiró.',
  'Nothing yet': 'Nada todavía',
  'This records changes from the day it was added — people who were already here do not appear until something happens to their access':
    'Esto registra cambios desde el día en que se agregó: quienes ya estaban aquí no aparecen hasta que algo pase con su acceso.',

  // Who can do what
  'Grid': 'Cuadrícula',
  'One person': 'Una persona',
  'Compare two': 'Comparar dos',
  'A padlock comes with their role — change the role on their page to take it away. A tick was given to them individually. Ticks you change are marked, and nothing is saved until you press Save. Permissions only ever add':
    'Un candado viene con su rol; cambia el rol en su página para quitarlo. Una marca se le dio de forma individual. Las marcas que cambias quedan señaladas, y nada se guarda hasta que presiones Guardar. Los permisos solo suman.',
  'Changes take effect on that person’s next request — they do not have to sign in again':
    'Los cambios aplican en la próxima acción de esa persona; no tiene que volver a iniciar sesión.',
  'You can only change the people on your team, and only permissions you hold yourself':
    'Solo puedes cambiar a las personas de tu equipo, y solo permisos que tú mismo tienes.',
  'Everything one person can do, in plain words — and what they cannot':
    'Todo lo que puede hacer una persona, en palabras simples, y lo que no.',
  'Change what they can do on their page': 'Cambia lo que puede hacer en su página',
  'Pick two people to see what one can do and the other cannot — the answer to “why can Ana see this load and Luis can’t?”. Whether somebody can open one particular load also depends on who owns it; this compares what they are allowed, not whose records they hold':
    'Elige a dos personas para ver lo que una puede hacer y la otra no: la respuesta a “¿por qué Ana puede ver esta carga y Luis no?”. Si alguien puede abrir una carga en particular también depende de quién es su dueño; esto compara lo que tienen permitido, no de quién son los registros.',
  'First person': 'Primera persona',
  'Second person': 'Segunda persona',
  'Nothing the other cannot do': 'Nada que la otra no pueda hacer.',
  'Both ({n})': 'Ambas ({n})',
  'Nobody to show': 'No hay nadie que mostrar',

  // Change log
  'Show everything': 'Mostrar todo',
  'Show the {n} changes': 'Mostrar los {n} cambios',
  'More fields changed than are listed here': 'Cambiaron más campos de los que se muestran aquí.',
  'Nothing recorded yet': 'Todavía no hay nada registrado',
  'Nothing matches': 'Nada coincide',

  // Search actions
  'Turn off reminder emails': 'Apagar los correos de recordatorio',
  'Turn on reminder emails': 'Encender los correos de recordatorio',
  'Turn off online status': 'Apagar el estado en línea',
  'Turn on online status': 'Encender el estado en línea',
  'Write dates as 4-Mar-2020': 'Escribir las fechas como 4-Mar-2020',
  'Write dates as 03/04/2020 (month first)': 'Escribir las fechas como 03/04/2020 (mes primero)',
  'Write dates as 04/03/2020 (day first)': 'Escribir las fechas como 04/03/2020 (día primero)',
  'Use the free distance estimate': 'Usar la estimación de distancia gratis',
  'Switch lane distance off': 'Apagar la distancia de la ruta',
  'Stop the celebrations message': 'Detener el mensaje de celebraciones',
  'Start the celebrations message': 'Iniciar el mensaje de celebraciones',
};
