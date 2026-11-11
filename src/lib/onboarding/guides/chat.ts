import { b, type Guide } from '../guideTypes';

export const CHAT_GUIDE: Guide = {
  id: 'chat',
  group: 'app',
  icon: 'chat',
  title: b('Chat', 'Chat'),
  summary: b(
    'Message one colleague, a room of several, or everyone working on a load. Reply, react, share files, search, and choose what you are told about.',
    'Escribe a un compañero, a una sala de varios o a todos los que trabajan una carga. Responde, reacciona, comparte archivos, busca y elige de qué te avisan.',
  ),
  minutes: 15,
  tryHref: '/dashboard/chat',
  tracks: 'all',
  sections: [
    {
      id: 'tour',
      title: b('The Chat screen', 'La pantalla del Chat'),
      intro: b(
        'Open Chat from the sidebar. The screen has two halves: your conversations on the left, and the one you picked on the right. Everybody in TTMS is staff, so you can message anybody.',
        'Abre el Chat desde la barra lateral. La pantalla tiene dos mitades: tus conversaciones a la izquierda, y la que elegiste a la derecha. Todos en TTMS son personal de la empresa, así que puedes escribirle a cualquiera.',
      ),
      screen: 'chat-overview',
      steps: [
        { spot: 1, text: b('The conversation list. Each line is a person, a room or a load. A bold line with a number has messages you have not read.', 'La lista de conversaciones. Cada línea es una persona, una sala o una carga. Una línea en negrita con un número tiene mensajes que no has leído.') },
        { spot: 2, text: b('Search. Type a name to find a chat, or a word and press Enter to search what was said.', 'Búsqueda. Escribe un nombre para encontrar un chat, o una palabra y presiona Enter para buscar lo que se dijo.') },
        { spot: 3, text: b('Filters: All, Favorites, Unread, Rooms and Loads, plus any lists you make yourself.', 'Filtros: Todos, Favoritos, No leídos, Salas y Cargas, más las listas que hagas tú.') },
        { spot: 4, text: b('Start a new conversation.', 'Empezar una conversación nueva.') },
        { spot: 5, text: b('The header: who you are talking to, and the buttons to search this chat, see its files and links, and (in a room) its settings.', 'El encabezado: con quién hablas, y los botones para buscar en este chat, ver sus archivos y enlaces y (en una sala) su configuración.') },
        { spot: 6, text: b('The messages, newest at the bottom.', 'Los mensajes, los más nuevos abajo.') },
        { spot: 7, text: b('Where you write. Press Enter to send.', 'Donde escribes. Presiona Enter para enviar.') },
      ],
      callouts: [
        { tone: 'tip', text: b('Chat follows you. On every other page there is a round chat button at the bottom right that opens a small chat window, so you never have to leave an order to answer someone.', 'El chat te sigue. En todas las demás páginas hay un botón redondo de chat abajo a la derecha que abre una ventana pequeña, para que nunca tengas que salir de una orden para responder.') },
        { tone: 'tip', text: b('The line between the two halves can be dragged to make the list wider or narrower. Double-click it to put it back.', 'La línea entre las dos mitades se puede arrastrar para hacer la lista más ancha o más angosta. Haz doble clic para regresarla.') },
      ],
    },
    {
      id: 'start',
      title: b('Start a conversation', 'Empezar una conversación'),
      intro: b('There are three kinds of conversation you can start.', 'Hay tres tipos de conversación que puedes empezar.'),
      screen: 'chat-new',
      steps: [
        { spot: 1, text: b('Click the speech-bubble-with-a-plus button above the list. The New conversation window opens.', 'Haz clic en el botón de la burbuja con un más, arriba de la lista. Se abre la ventana Conversación nueva.') },
        { spot: 2, text: b('Pick the kind: One person (just the two of you), A room (a group with a name), or Announcements only (a room where only its admins can write).', 'Elige el tipo: Una persona (solo ustedes dos), Una sala (un grupo con nombre) o Solo anuncios (una sala donde solo sus administradores pueden escribir).') },
        { spot: 3, text: b('For a room, give it a name people will recognise: "Dispatch", "Night shift", "Acme move".', 'Para una sala, ponle un nombre que la gente reconozca: "Dispatch", "Turno de noche", "Mudanza Acme".') },
        { spot: 4, text: b('Search for people by name. For one person, click their name and the chat opens; for a room, tick everybody you want in it.', 'Busca a las personas por nombre. Para una persona, haz clic en su nombre y se abre el chat; para una sala, marca a todos los que quieras.') },
        { spot: 5, text: b('For a room, press Create room. You are its first admin.', 'Para una sala, presiona Crear sala. Tú eres su primer administrador.') },
      ],
      callouts: [
        { tone: 'tip', text: b('You can also message somebody from their Directory page with the Message button, or from their picture anywhere in chat.', 'También puedes escribirle a alguien desde su página del Directorio con el botón Mensaje, o desde su foto en cualquier parte del chat.') },
      ],
    },
    {
      id: 'write',
      title: b('Write a message', 'Escribir un mensaje'),
      screen: 'chat-composer',
      steps: [
        { spot: 1, text: b('Click in the box at the bottom and type.', 'Haz clic en la caja de abajo y escribe.') },
        { spot: 1, text: b('Enter sends. Shift + Enter starts a new line without sending.', 'Enter envía. Shift + Enter hace una línea nueva sin enviar.') },
        { spot: 1, text: b('Put stars around words for bold — *urgent* — and underscores for italics — _today_.', 'Pon asteriscos alrededor de las palabras para negrita — *urgente* — y guiones bajos para cursiva — _hoy_.') },
        { spot: 2, text: b('Type @ and the start of a name to name somebody. Use the arrow keys and Enter to pick. They get told even in a room they turned down to Only when named.', 'Escribe @ y el inicio de un nombre para mencionar a alguien. Usa las flechas y Enter para elegir. Le llega un aviso aunque haya puesto la sala en Solo cuando me mencionan.') },
        { spot: 3, text: b('The paperclip attaches photos or files. You can also drag a file onto the conversation, or paste a screenshot with Ctrl + V.', 'El clip adjunta fotos o archivos. También puedes arrastrar un archivo a la conversación o pegar una captura con Ctrl + V.') },
        { spot: 4, text: b('The smiley adds an emoji.', 'La carita agrega un emoji.') },
        { spot: 5, text: b('The sticker button opens stickers and GIFs. You can make your own sticker from a picture, keep favorites and sort them into folders only you see.', 'El botón de stickers abre stickers y GIFs. Puedes hacer tu propio sticker con una imagen, guardar favoritos y ordenarlos en carpetas que solo tú ves.') },
        { spot: 6, text: b('Send.', 'Enviar.') },
      ],
      callouts: [
        { tone: 'tip', text: b('A message that names a load number can be opened from chat: paste the order link and TTMS shows the load as a card.', 'Un mensaje con un número de carga se puede abrir desde el chat: pega el enlace de la orden y TTMS muestra la carga como una tarjeta.') },
        { tone: 'warn', text: b('Some rooms only let their admins post, attach files or links. If the box says so, that is a room rule, not a fault.', 'Algunas salas solo dejan a sus administradores publicar, adjuntar archivos o enlaces. Si la caja lo dice, es una regla de la sala, no una falla.') },
      ],
    },
    {
      id: 'message-actions',
      title: b('Reply, react, edit, delete, pin', 'Responder, reaccionar, editar, borrar, fijar'),
      intro: b('Move the mouse over any message (on a phone, press and hold it) to see what you can do with it.', 'Pasa el mouse sobre cualquier mensaje (en el teléfono, mantenlo presionado) para ver lo que puedes hacer.'),
      screen: 'chat-message',
      steps: [
        { spot: 1, text: b('React with one tap: Got it, Done, Question, Looking, Thanks, Love it — or any emoji from More emoji. A reaction answers without adding another message to read.', 'Reacciona con un toque: Entendido, Hecho, Pregunta, Revisando, Gracias, Me encanta — o cualquier emoji desde Más emojis. Una reacción responde sin agregar otro mensaje que leer.') },
        { spot: 2, text: b('Reply in a thread: the answer goes under that message, so a side question does not bury the main conversation.', 'Responder en hilo: la respuesta queda debajo de ese mensaje, para que una pregunta aparte no entierre la conversación principal.') },
        { spot: 3, text: b('The three dots open the rest: Reply, Reply privately (in a room, to message the sender alone), Edit and Delete your own messages, and Pin to room.', 'Los tres puntos abren lo demás: Responder, Responder en privado (en una sala, para escribirle solo al remitente), Editar y Borrar tus propios mensajes, y Fijar en la sala.') },
        { spot: 4, text: b('Pinned messages show in a bar at the top of the room. Use it for the address, the procedure, the thing everyone keeps asking.', 'Los mensajes fijados aparecen en una barra arriba de la sala. Úsala para la dirección, el procedimiento, lo que todos siempre preguntan.') },
      ],
      callouts: [
        { tone: 'why', text: b('A deleted message leaves a line saying it was removed. If a room admin removed yours, it says who did — so you never think you did it yourself.', 'Un mensaje borrado deja una línea que dice que se eliminó. Si un administrador de la sala quitó el tuyo, dice quién fue, para que nunca pienses que lo hiciste tú.') },
      ],
    },
    {
      id: 'threads',
      title: b('Threads', 'Hilos'),
      points: [
        b('A thread is a small conversation under one message. Open it from the speech bubble on the message or from "replies" under it.', 'Un hilo es una conversación pequeña debajo de un mensaje. Ábrelo con la burbuja del mensaje o con "respuestas" debajo de él.'),
        b('The thread opens on the right. Write in its own box at the bottom.', 'El hilo se abre a la derecha. Escribe en su propia caja abajo.'),
        b('"Threads you are in" at the top of the conversation list gathers every thread you have written in or were named in, newest first.', '"Hilos en los que estás" arriba de la lista junta cada hilo donde escribiste o te mencionaron, el más nuevo primero.'),
        b('A dot on it means a thread has a new reply. An @ means somebody named you.', 'Un punto significa que un hilo tiene una respuesta nueva. Una @ significa que alguien te mencionó.'),
      ],
    },
    {
      id: 'organise',
      title: b('Keep your list tidy', 'Mantén tu lista ordenada'),
      intro: b('Open the menu on any conversation in the list (the three dots that appear when you point at it).', 'Abre el menú de cualquier conversación en la lista (los tres puntos que aparecen al pasar el mouse).'),
      screen: 'chat-list-menu',
      steps: [
        { spot: 1, text: b('Pin to top keeps the conversation at the top of the whole list. Move up and Move down change the order of your pins.', 'Fijar arriba mantiene la conversación al inicio de toda la lista. Subir y Bajar cambian el orden de tus fijados.') },
        { spot: 2, text: b('Add to Favorites puts it behind the Favorites chip, without using up the top of your list.', 'Agregar a Favoritos la pone detrás del filtro Favoritos, sin ocupar el inicio de tu lista.') },
        { spot: 3, text: b('Lists are your own filters — "My clients", "Carriers", "Night shift". Tick a list to put the chat in it, or New list with this chat… to start one.', 'Las listas son tus propios filtros — "Mis clientes", "Transportistas", "Turno de noche". Marca una lista para meter el chat ahí, o Nueva lista con este chat… para crear una.') },
        { spot: 4, text: b('Notify me about: All messages, Only when named, or Nothing — mute. A muted room still shows unread messages; it just stops interrupting you — even an @ with your name stays quiet, so mute with care.', 'Avisarme de: Todos los mensajes, Solo cuando me mencionan o Nada — silenciar. Una sala silenciada sigue mostrando los no leídos; solo deja de interrumpirte — ni una @ con tu nombre avisa, así que silencia con cuidado.') },
      ],
      callouts: [
        { tone: 'tip', text: b('A list chip has its own menu to rename or delete the list. Deleting a list never deletes a conversation.', 'El filtro de una lista tiene su propio menú para renombrarla o borrarla. Borrar una lista nunca borra una conversación.') },
      ],
    },
    {
      id: 'alerts',
      title: b('Notifications and sound', 'Notificaciones y sonido'),
      steps: [
        { text: b('Click the bell at the top of the conversation list.', 'Haz clic en la campana arriba de la lista de conversaciones.') },
        { text: b('Choose Desktop notification to get a pop-up from the computer when a message arrives. The browser will ask you to Allow — click Allow.', 'Elige Notificación de escritorio para recibir un aviso de la computadora cuando llegue un mensaje. El navegador te pedirá Permitir — haz clic en Permitir.') },
        { text: b('Tick Play a sound if you want to hear it too. It is off by default — a shared desk would not thank you.', 'Marca Reproducir sonido si también quieres oírlo. Viene apagado — en un escritorio compartido no lo agradecerían.') },
      ],
      callouts: [
        { tone: 'tip', text: b('These follow the per-room choice above: a muted room sends no pop-up, and a room set to Only when named pops up only when someone uses @ with your name.', 'Esto sigue la elección de cada sala: una sala silenciada no manda avisos, y una con Solo cuando me mencionan avisa solo cuando alguien usa @ con tu nombre.') },
      ],
    },
    {
      id: 'search',
      title: b('Find something that was said', 'Encontrar algo que se dijo'),
      steps: [
        { text: b('To search everywhere, type in the search box above the list and press Enter.', 'Para buscar en todo, escribe en la caja de búsqueda arriba de la lista y presiona Enter.') },
        { text: b('To search only one conversation, open it and click the magnifier in its header.', 'Para buscar solo en una conversación, ábrela y haz clic en la lupa de su encabezado.') },
        { text: b('Click a result to jump to the message, with the conversation around it.', 'Haz clic en un resultado para saltar al mensaje, con la conversación alrededor.') },
      ],
      callouts: [
        { tone: 'warn', text: b('Search finds whole words. "invoice" finds it; "invoic" does not. Add another word to narrow a long list of results.', 'La búsqueda encuentra palabras completas. "invoice" lo encuentra; "invoic" no. Agrega otra palabra para reducir una lista larga.') },
        { tone: 'why', text: b('It only searches rooms you are in. A load room you have never opened is not searched.', 'Solo busca en salas donde estás. Una sala de carga que nunca abriste no se busca.') },
      ],
    },
    {
      id: 'files',
      title: b('Every file and link, in one place', 'Todos los archivos y enlaces en un lugar'),
      points: [
        b('Click the paperclip in a conversation’s header to open Files and links.', 'Haz clic en el clip del encabezado de una conversación para abrir Archivos y enlaces.'),
        b('Three tabs: Media (photos and videos), Documents, and Links.', 'Tres pestañas: Multimedia (fotos y videos), Documentos y Enlaces.'),
        b('Open the file, or Go to the message to see what was said around it.', 'Abre el archivo, o Ir al mensaje para ver lo que se dijo alrededor.'),
      ],
    },
    {
      id: 'rooms',
      title: b('Running a room', 'Administrar una sala'),
      intro: b('Whoever creates a room is its admin. Admins open Room settings from the gear in the header.', 'Quien crea una sala es su administrador. Los administradores abren la Configuración de la sala con el engrane del encabezado.'),
      screen: 'chat-room-settings',
      steps: [
        { spot: 1, text: b('Picture and Name: what everybody sees in their list.', 'Foto y Nombre: lo que todos ven en su lista.') },
        { spot: 2, text: b('People: add someone by typing a name, take someone out, make someone an Admin, or Mute them for a while. A mute always ends by itself, and it is never announced in the room.', 'Personas: agrega a alguien escribiendo su nombre, saca a alguien, hazlo Administrador o Siléncialo por un tiempo. Un silencio siempre termina solo, y nunca se anuncia en la sala.') },
        { spot: 3, text: b('What the room allows: for each of Send messages, Add and remove people, Rename and set the picture, Attach photos and files, Post links and Pin messages, choose Everyone or Only admins. Changes apply straight away.', 'Lo que permite la sala: para Enviar mensajes, Agregar y quitar personas, Renombrar y poner foto, Adjuntar fotos y archivos, Publicar enlaces y Fijar mensajes, elige Todos o Solo administradores. Los cambios aplican al instante.') },
        { spot: 4, text: b('History lists every change to the room and who made it.', 'Historial muestra cada cambio a la sala y quién lo hizo.') },
        { spot: 5, text: b('Leave room. If you are the only admin you will be asked to hand over to somebody first, so a room is never left with nobody running it.', 'Salir de la sala. Si eres el único administrador, te pedirá entregarla a alguien primero, para que una sala nunca quede sin nadie a cargo.') },
      ],
    },
    {
      id: 'loads',
      title: b('Talking about a load', 'Hablar de una carga'),
      points: [
        b('Every order has a Discuss button. Pressing it opens (or starts) that load’s own room, with the people working it.', 'Cada orden tiene un botón Discutir. Al presionarlo se abre (o se crea) la sala propia de esa carga, con las personas que la trabajan.'),
        b('TTMS posts updates there by itself: when an agreement is sent or signed, when the driver taps a step, when a request is answered.', 'TTMS publica avisos ahí solo: cuando se envía o firma un acuerdo, cuando el conductor marca un paso, cuando se responde una solicitud.'),
        b('Each update has a colour: green when something is done, amber when somebody has to act, red when something stopped working, blue for news. Buttons on it open the load or the signing page.', 'Cada aviso tiene un color: verde cuando algo está hecho, ámbar cuando alguien tiene que actuar, rojo cuando algo dejó de funcionar, azul para novedades. Sus botones abren la carga o la página de firma.'),
        b('The Loads filter shows only load rooms. The button in a load room’s header opens the order.', 'El filtro Cargas muestra solo las salas de carga. El botón del encabezado de una sala de carga abre la orden.'),
        b('When a load is finished, choose Leave this room from its menu. Pressing Discuss on the order brings it back.', 'Cuando termines una carga, elige Salir de esta sala en su menú. Presionar Discutir en la orden la regresa.'),
      ],
      callouts: [
        { tone: 'why', text: b('Keep everything about a load in its room, not in private chats. When someone covers for you on a day off, the whole story is there.', 'Mantén todo sobre una carga en su sala, no en chats privados. Cuando alguien te cubra en tu día libre, toda la historia está ahí.') },
      ],
    },
    {
      id: 'company',
      title: b('The Everyone room and TTMS notices', 'La sala Todos y los avisos de TTMS'),
      points: [
        b('Everyone is the company-wide room. Admin and HR use it for announcements; at 8am TTMS posts birthdays and work anniversaries there.', 'Todos es la sala de toda la empresa. Admin y RR. HH. la usan para anuncios; a las 8am TTMS publica ahí los cumpleaños y aniversarios.'),
        b('Some rooms are notices from TTMS only — your task reminders, IT support answers. You can read them but not write in them.', 'Algunas salas son solo avisos de TTMS — tus recordatorios de tareas, respuestas de soporte de TI. Puedes leerlas pero no escribir en ellas.'),
      ],
    },
    {
      id: 'personal',
      title: b('Make it yours', 'Hazlo tuyo'),
      points: [
        b('Chat appearance: the picture button at the top of the conversation list picks a wallpaper and how load updates look (Tickets, Cards or Timeline). It is saved to your account, and nobody else sees it.', 'Apariencia del chat: el botón de imagen arriba de la lista de conversaciones elige un fondo y cómo se ven los avisos de las cargas (Tarjetas con franja, Tarjetas o Línea de tiempo). Se guarda en tu cuenta, y nadie más lo ve.'),
        b('Online status: a green dot means someone is in TTMS now. You can hide when you were last seen from your profile page.', 'Estado en línea: un punto verde significa que alguien está en TTMS ahora. Puedes ocultar cuándo te vieron por última vez desde tu perfil.'),
      ],
    },
    {
      id: 'manners',
      title: b('Good chat habits at work', 'Buenos hábitos de chat en el trabajo'),
      points: [
        b('Say the whole thing in one message: "Hi Ana — load 4521, the shipper changed pickup to 2pm. Can the driver still make it?" beats "Hi" and waiting.', 'Di todo en un mensaje: "Hola Ana — carga 4521, el shipper cambió la recogida a las 2pm. ¿El conductor todavía llega?" es mejor que "Hola" y esperar.'),
        b('Put the order number in every message about a load.', 'Pon el número de orden en cada mensaje sobre una carga.'),
        b('Use a reaction to say "seen" or "done" instead of a new message.', 'Usa una reacción para decir "visto" o "hecho" en lugar de un mensaje nuevo.'),
        b('Urgent and about to cost money? Call. Chat is for things that can wait a few minutes.', '¿Urgente y a punto de costar dinero? Llama. El chat es para lo que puede esperar unos minutos.'),
        b('Never put a client’s rate in a room the carrier’s people are in, or a carrier’s pay where the client could see it.', 'Nunca pongas la tarifa de un cliente en una sala donde está gente del transportista, ni el pago del transportista donde el cliente lo pueda ver.'),
      ],
    },
  ],
  faq: [
    { q: b('I sent something by mistake. Can I take it back?', 'Envié algo por error. ¿Lo puedo quitar?'),
      a: b('Yes. Point at the message, open the three dots and choose Delete. Choose Edit to fix a typo instead.', 'Sí. Pasa el mouse sobre el mensaje, abre los tres puntos y elige Borrar. Elige Editar para corregir un error.') },
    { q: b('Why can I not write in a room?', '¿Por qué no puedo escribir en una sala?'),
      a: b('Its admins set it to announcements only, or you were muted for a while. The box at the bottom says which.', 'Sus administradores la pusieron en solo anuncios, o te silenciaron un tiempo. La caja de abajo dice cuál.') },
    { q: b('I left a load room. How do I get back?', 'Salí de una sala de carga. ¿Cómo regreso?'),
      a: b('Open the order and press Discuss.', 'Abre la orden y presiona Discutir.') },
    { q: b('Can admins read my private chats?', '¿Los administradores pueden leer mis chats privados?'),
      a: b('Chat is a work tool on a company system. Write everything as if a colleague might read it one day.', 'El chat es una herramienta de trabajo en un sistema de la empresa. Escribe todo como si un compañero pudiera leerlo algún día.') },
    { q: b('I do not get pop-ups.', 'No me llegan avisos.'),
      a: b('Click the bell, choose Desktop notification, and click Allow when the browser asks. If you clicked Block before, open the lock beside the address and allow Notifications.', 'Haz clic en la campana, elige Notificación de escritorio y haz clic en Permitir cuando el navegador pregunte. Si antes hiciste clic en Bloquear, abre el candado junto a la dirección y permite Notificaciones.') },
  ],
  quiz: [
    { q: b('You want to ask a side question about one message without interrupting the room. What do you use?', 'Quieres hacer una pregunta aparte sobre un mensaje sin interrumpir la sala. ¿Qué usas?'),
      options: [b('A new room', 'Una sala nueva'), b('A thread on that message', 'Un hilo en ese mensaje'), b('The Everyone room', 'La sala Todos')],
      answer: 1, why: b('A thread keeps the answer under the message it is about.', 'Un hilo mantiene la respuesta debajo del mensaje del que trata.') },
    { q: b('A room is too noisy, but you still want to know when someone needs you. What do you choose?', 'Una sala es muy ruidosa pero quieres saber cuando alguien te necesita. ¿Qué eliges?'),
      options: [b('Leave the room', 'Salir de la sala'), b('Nothing — mute', 'Nada — silenciar'), b('Only when named', 'Solo cuando me mencionan')],
      answer: 2, why: b('Only when named still tells you about an @ with your name.', 'Solo cuando me mencionan todavía te avisa de una @ con tu nombre.') },
    { q: b('Where should the conversation about load 4521 happen?', '¿Dónde debe ir la conversación sobre la carga 4521?'),
      options: [b('In private messages', 'En mensajes privados'), b('In the load’s room, from Discuss on the order', 'En la sala de la carga, con Discutir en la orden'), b('By email only', 'Solo por correo')],
      answer: 1, why: b('Then anybody covering for you sees the whole story.', 'Así cualquiera que te cubra ve toda la historia.') },
    { q: b('Search finds nothing for "invoic". Why?', 'La búsqueda no encuentra nada con "invoic". ¿Por qué?'),
      options: [b('Search needs whole words', 'La búsqueda necesita palabras completas'), b('Search is broken', 'La búsqueda está rota'), b('Only admins can search', 'Solo los administradores pueden buscar')],
      answer: 0, why: b('Type the whole word: "invoice".', 'Escribe la palabra completa: "invoice".') },
  ],
};
