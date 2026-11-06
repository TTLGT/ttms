import { b, type Guide } from '../guideTypes';

/**
 * HR's plan asks for this section to be expanded before every training, so the
 * trainer never has to improvise examples. The trainer keeps it current —
 * edit the lists below; nothing else depends on them.
 */
export const FINDING_SHIPPERS_GUIDE: Guide = {
  id: 'finding-shippers',
  group: 'sales',
  icon: 'search',
  title: b('Finding shippers', 'Cómo encontrar shippers'),
  summary: b(
    'Where clients come from: the kinds of companies that ship, how to find them, how to reach them, and how to keep track so nobody slips away.',
    'De dónde vienen los clientes: los tipos de empresas que envían, cómo encontrarlas, cómo contactarlas y cómo dar seguimiento para que nadie se escape.',
  ),
  minutes: 20,
  tracks: ['broker', 'salesManager'],
  sections: [
    {
      id: 'who-ships',
      title: b('Who ships freight', 'Quién envía carga'),
      intro: b('Almost every business that makes, sells or moves something physical needs trucks. Start with companies that ship often and are not too big to answer the phone.', 'Casi todo negocio que fabrica, vende o mueve algo físico necesita camiones. Empieza con empresas que envían seguido y no son tan grandes como para no contestar.'),
      table: [
        [b('Sector', 'Sector'), b('Examples of what they ship', 'Ejemplos de lo que envían'), b('Usual truck', 'Camión usual')],
        [b('Manufacturers', 'Fabricantes'), b('Machines, parts, finished goods', 'Máquinas, piezas, producto terminado'), b('Dry van, flatbed', 'Dry van, plataforma')],
        [b('Equipment dealers', 'Distribuidores de equipo'), b('Tractors, forklifts, excavators, generators', 'Tractores, montacargas, excavadoras, generadores'), b('Flatbed, step deck, Landoll', 'Plataforma, step deck, Landoll')],
        [b('Building supply', 'Materiales de construcción'), b('Lumber, steel, pipe, roofing, sheds', 'Madera, acero, tubería, techos, bodegas'), b('Flatbed, hotshot', 'Plataforma, hotshot')],
        [b('Food and farms', 'Alimentos y granjas'), b('Produce, frozen food, drinks', 'Frutas y verduras, congelados, bebidas'), b('Reefer', 'Reefer')],
        [b('Auctions and resellers', 'Subastas y revendedores'), b('Used machines, vehicles, pallets of returns', 'Máquinas usadas, vehículos, tarimas de devoluciones'), b('Flatbed, car hauler, dry van', 'Plataforma, portaautos, dry van')],
        [b('Online sellers', 'Vendedores en línea'), b('Furniture, gym equipment, large items', 'Muebles, equipo de gimnasio, artículos grandes'), b('Box truck, LTL', 'Camión caja, LTL')],
        [b('Movers of one big thing', 'Quien mueve una sola cosa grande'), b('A boat, a container, a shed, a vehicle', 'Una lancha, un contenedor, una bodega, un vehículo'), b('Depends — ask', 'Depende — pregunta')],
      ],
    },
    {
      id: 'channels',
      title: b('Where to find them', 'Dónde encontrarlos'),
      intro: b('Training shows you every method. The goal is not to use them all — it is to find the two or three that work for you, and do them every day.', 'El training te muestra cada método. La meta no es usarlos todos — es encontrar los dos o tres que te funcionan y hacerlos todos los días.'),
      table: [
        [b('Method', 'Método'), b('How', 'Cómo'), b('Watch out for', 'Cuidado con')],
        [b('Phone (cold calling)', 'Teléfono (cold calling)'), b('Call companies in a sector from a list. See the Cold calling guide', 'Llama a empresas de un sector desde una lista. Ver la guía de Cold calling'), b('Calling the same company twice in a week', 'Llamar a la misma empresa dos veces en una semana')],
        [b('Facebook', 'Facebook'), b('Groups and Marketplace where people post freight or sell equipment that has to move', 'Grupos y Marketplace donde la gente publica carga o vende equipo que hay que mover'), b('Posting the same message everywhere — it is treated as spam', 'Publicar el mismo mensaje en todos lados — se toma como spam')],
        [b('Email', 'Correo'), b('A short, personal email to a named person, followed by a call', 'Un correo corto y personal a una persona con nombre, seguido de una llamada'), b('Long emails and attachments nobody opens', 'Correos largos y adjuntos que nadie abre')],
        [b('Text messages', 'Mensajes de texto'), b('After a call, to someone who gave you their mobile', 'Después de una llamada, a alguien que te dio su celular'), b('Texting someone who never gave you the number', 'Escribirle a alguien que nunca te dio su número')],
        [b('AI tools', 'Herramientas de IA'), b('Ask for lists of companies in a sector and city, or help writing a first email', 'Pide listas de empresas de un sector y ciudad, o ayuda para escribir un primer correo'), b('Check every company is real before you call. Never paste client rates or names into an AI tool', 'Revisa que cada empresa sea real antes de llamar. Nunca pegues tarifas ni nombres de clientes en una IA')],
        [b('Super Dispatch / Central Dispatch', 'Super Dispatch / Central Dispatch'), b('Load boards, strongest for vehicles. Loads posted there show who is shipping today', 'Load boards, más fuertes en vehículos. Las cargas publicadas muestran quién envía hoy'), b('Prices there are low; win on service, not on price', 'Los precios ahí son bajos; gana por servicio, no por precio')],
        [b('Referrals', 'Referidos'), b('Ask every happy client: "Who else do you know who ships?"', 'Pregúntale a cada cliente contento: "¿A quién más conoces que envíe carga?"'), b('Forgetting to ask', 'Olvidarte de preguntar')],
      ],
    },
    {
      id: 'searches',
      title: b('Example searches', 'Búsquedas de ejemplo'),
      points: [
        b('"equipment dealer" + a state: "tractor dealer Texas", "forklift sales Georgia".', '"equipment dealer" + un estado: "tractor dealer Texas", "forklift sales Georgia".'),
        b('"manufacturer" + a product + a city: "steel fabrication Houston", "trailer manufacturer Indiana".', '"manufacturer" + un producto + una ciudad: "steel fabrication Houston", "trailer manufacturer Indiana".'),
        b('Auction sites for the week’s sales: whoever buys a machine needs it moved.', 'Sitios de subastas con las ventas de la semana: quien compra una máquina necesita moverla.'),
        b('Facebook groups: "heavy equipment for sale", "freight loads", "car haulers".', 'Grupos de Facebook: "heavy equipment for sale", "freight loads", "car haulers".'),
        b('Ask AI: "List 20 companies in Dallas that sell used construction equipment, with their websites." Then check each one.', 'Pregúntale a la IA: "List 20 companies in Dallas that sell used construction equipment, with their websites." Luego revisa cada una.'),
      ],
    },
    {
      id: 'qualify',
      title: b('Is this a good prospect?', '¿Es un buen prospecto?'),
      points: [
        b('How often do they ship? Once a week beats once a year.', '¿Qué tan seguido envían? Una vez por semana es mejor que una vez al año.'),
        b('What and where? Does it fit the trucks we book well?', '¿Qué y a dónde? ¿Encaja con los camiones que reservamos bien?'),
        b('Who decides? Get the name of the person who books freight.', '¿Quién decide? Consigue el nombre de la persona que reserva el transporte.'),
        b('Who do they use now, and what would make them try someone new?', '¿Con quién trabajan ahora, y qué los haría probar a alguien nuevo?'),
        b('Can they pay? Large unknown first loads are checked with finance before booking.', '¿Pueden pagar? Las primeras cargas grandes de alguien desconocido se revisan con finanzas antes de reservar.'),
      ],
    },
    {
      id: 'track',
      title: b('Write it down, every time', 'Anótalo, siempre'),
      steps: [
        { text: b('Add the prospect as a client in TTMS: company, contact name, phone, email, what they ship. The phone search finds them again from the number that rang in.', 'Agrega el prospecto como cliente en TTMS: empresa, contacto, teléfono, correo, qué envían. La búsqueda por teléfono lo encuentra otra vez por el número que llamó.') },
        { text: b('Set where they came from (the lead source).', 'Pon de dónde vino (la fuente del lead).') },
        { text: b('Add a task with the next step and a date: "Call Mike at Acme back Tuesday 10am — he ships tractors weekly".', 'Agrega una tarea con el siguiente paso y una fecha: "Llamar a Mike de Acme el martes 10am — envía tractores cada semana".') },
        { text: b('Put it in your Waiting on someone column until they answer.', 'Ponla en tu columna Esperando a alguien hasta que respondan.') },
      ],
      callouts: [
        { tone: 'why', text: b('Most clients say yes after several contacts, not the first. Without a next step written down, the fifth contact never happens.', 'La mayoría de los clientes dicen que sí después de varios contactos, no al primero. Sin un siguiente paso escrito, el quinto contacto nunca pasa.') },
      ],
    },
  ],
  quiz: [
    { q: b('A prospect ships tractors every week. What do you do right after the call?', 'Un prospecto envía tractores cada semana. ¿Qué haces justo después de la llamada?'),
      options: [b('Remember it', 'Recordarlo'), b('Add them in TTMS with a next-step task', 'Agregarlo en TTMS con una tarea del siguiente paso'), b('Wait for them to call', 'Esperar que llamen')],
      answer: 1, why: b('If it is not written down with a date, it will not happen.', 'Si no está escrito con fecha, no va a pasar.') },
  ],
};
