import { b, type Guide } from '../guideTypes';

export const DIRECTORY_GUIDE: Guide = {
  id: 'directory',
  group: 'app',
  icon: 'directory',
  title: b('Directory', 'Directorio'),
  summary: b(
    'The company phone book: find anybody by name, role, phone or extension, see who is on which team, and reach them in one click.',
    'La guía telefónica de la empresa: encuentra a cualquiera por nombre, puesto, teléfono o extensión, mira quién está en qué equipo y contáctalo con un clic.',
  ),
  minutes: 8,
  tryHref: '/dashboard/directory',
  tracks: 'all',
  sections: [
    {
      id: 'tour',
      title: b('The Directory page', 'La página del Directorio'),
      screen: 'directory-cards',
      steps: [
        { spot: 1, text: b('Search by name, role, email, phone or extension. Results narrow as you type.', 'Busca por nombre, puesto, correo, teléfono o extensión. Los resultados se reducen mientras escribes.') },
        { spot: 2, text: b('Offices: My office, Every office, or one office. Teams: My team, Every team, or one team.', 'Oficinas: Mi oficina, Todas las oficinas o una oficina. Equipos: Mi equipo, Todos los equipos o un equipo.') },
        { spot: 3, text: b('Four ways to look: Cards, Profiles, List and Org chart.', 'Cuatro formas de ver: Tarjetas, Perfiles, Lista y Organigrama.') },
        { spot: 4, text: b('A person’s card: photo, name, role, extension and phone. Click it to open their page.', 'La tarjeta de una persona: foto, nombre, puesto, extensión y teléfono. Haz clic para abrir su página.') },
        { spot: 5, text: b('Print extension sheet and Export CSV, for the people who keep the list (admin, HR, dispatch).', 'Imprimir hoja de extensiones y Exportar CSV, para quienes mantienen la lista (admin, RR. HH., despacho).') },
      ],
      callouts: [
        { tone: 'tip', text: b('The Org chart shows who leads which team. Use it in your first week to learn who is who.', 'El Organigrama muestra quién lidera qué equipo. Úsalo en tu primera semana para aprender quién es quién.') },
      ],
    },
    {
      id: 'person',
      title: b('A person’s page', 'La página de una persona'),
      screen: 'directory-profile',
      steps: [
        { spot: 1, text: b('Message opens a chat with them straight away.', 'Mensaje abre un chat con esa persona al instante.') },
        { spot: 2, text: b('How to reach them: phone (click to dial, or the copy button to copy it), extension and email.', 'Cómo contactarla: teléfono (clic para marcar, o el botón de copiar), extensión y correo.') },
        { spot: 3, text: b('Where they sit: office, team and team lead. Click the team to see everyone on it.', 'Dónde está: oficina, equipo y líder del equipo. Haz clic en el equipo para ver a todos.') },
        { spot: 4, text: b('Book of business: how many clients they own and how many loads are open. You see your own; team leads see their team’s.', 'Cartera: cuántos clientes tiene y cuántas cargas están abiertas. Tú ves la tuya; los líderes ven la de su equipo.') },
        { spot: 5, text: b('Copy link to this page, to send someone the contact.', 'Copiar enlace de esta página, para mandarle el contacto a alguien.') },
      ],
      callouts: [
        { tone: 'why', text: b('"Not on chat yet" means they were invited to TTMS but have never signed in.', '"Aún no está en el chat" quiere decir que lo invitaron a TTMS pero nunca ha iniciado sesión.') },
      ],
    },
    {
      id: 'fix',
      title: b('Something wrong or missing?', '¿Algo está mal o falta?'),
      points: [
        b('About you: open My profile (your name in the sidebar) and request the change. HR approves it.', 'Sobre ti: abre Mi perfil (tu nombre en la barra lateral) y pide el cambio. RR. HH. lo aprueba.'),
        b('About somebody else: ask an admin to update it in Settings → People.', 'Sobre otra persona: pide a un administrador que lo actualice en Configuración → Personas.'),
      ],
    },
  ],
  faq: [
    { q: b('Why can I not see someone’s birthday or personal email?', '¿Por qué no veo el cumpleaños o el correo personal de alguien?'),
      a: b('Those are payroll details, only for admins and HR.', 'Son datos de nómina, solo para administradores y RR. HH.') },
    { q: b('I cannot find a new colleague.', 'No encuentro a un compañero nuevo.'),
      a: b('Try Every office and Every team, and search part of their name. If they are still missing, HR has not added them yet.', 'Prueba con Todas las oficinas y Todos los equipos, y busca parte de su nombre. Si aún no aparece, RR. HH. no lo ha agregado.') },
  ],
  quiz: [
    { q: b('Your extension in the directory is wrong. What do you do?', 'Tu extensión en el directorio está mal. ¿Qué haces?'),
      options: [b('Request the change on My profile', 'Pedir el cambio en Mi perfil'), b('Ignore it', 'Ignorarlo'), b('Tell a carrier', 'Decirle a un transportista')],
      answer: 0, why: b('Requests on your own profile go to HR to approve.', 'Las solicitudes en tu perfil van a RR. HH. para aprobarlas.') },
  ],
};
