import { b, type Guide } from '../guideTypes';

export const COMPUTER_BASICS_GUIDE: Guide = {
  id: 'computer-basics',
  group: 'start',
  icon: 'compass',
  title: b('Computer and TTMS basics', 'Lo básico de la computadora y TTMS'),
  summary: b(
    'Signing in, moving around TTMS, the shortcuts that save hours, taking a screenshot, and staying safe from fake emails.',
    'Iniciar sesión, moverte por TTMS, los atajos que ahorran horas, tomar una captura y protegerte de correos falsos.',
  ),
  minutes: 10,
  tracks: 'all',
  sections: [
    {
      id: 'signin',
      title: b('Getting into TTMS', 'Entrar a TTMS'),
      steps: [
        { text: b('Open Google Chrome and go to ttms.totaltransportlogistics.us. Save it in your bookmarks bar.', 'Abre Google Chrome y ve a ttms.totaltransportlogistics.us. Guárdalo en tu barra de marcadores.') },
        { text: b('Click Sign in with Google and choose your company account (the one ending in @totaltransportlogistics.us).', 'Haz clic en Iniciar sesión con Google y elige tu cuenta de la empresa (la que termina en @totaltransportlogistics.us).') },
        { text: b('If TTMS signs you straight out, HR has not added you yet. Tell them.', 'Si TTMS te saca de inmediato, RR. HH. aún no te ha agregado. Avísales.') },
      ],
    },
    {
      id: 'around',
      title: b('Moving around', 'Moverte por TTMS'),
      screen: 'app-shell',
      steps: [
        { spot: 1, text: b('The sidebar on the left: every section you can open. You only see the ones your job needs.', 'La barra lateral a la izquierda: cada sección que puedes abrir. Solo ves las que tu puesto necesita.') },
        { spot: 2, text: b('The clock: Clock in when you start, Start break for breaks, Clock out when you finish.', 'El reloj: Marcar entrada al empezar, Iniciar descanso para los descansos, Marcar salida al terminar.') },
        { spot: 3, text: b('Your name opens the account menu: My profile, theme (light, dim or dark), Spanish, Learn English and Sign out.', 'Tu nombre abre el menú de cuenta: Mi perfil, tema (claro, tenue u oscuro), Español, Aprender inglés y Cerrar sesión.') },
        { spot: 4, text: b('The page you opened.', 'La página que abriste.') },
        { spot: 5, text: b('The chat button follows you everywhere.', 'El botón del chat te sigue a todos lados.') },
      ],
      callouts: [
        { tone: 'tip', text: b('Switch on Spanish in the account menu: headings get a Spanish line under them, and buttons show the Spanish when you point at them. This guide does the same.', 'Activa Español en el menú de cuenta: los títulos tienen una línea en español debajo, y los botones muestran el español al pasar el mouse. Esta guía hace lo mismo.') },
      ],
    },
    {
      id: 'shortcuts',
      title: b('Shortcuts worth learning on day one', 'Atajos que vale la pena aprender el primer día'),
      table: [
        [b('Keys', 'Teclas'), b('What it does', 'Qué hace')],
        [b('Ctrl + C, then Ctrl + V', 'Ctrl + C, luego Ctrl + V'), b('Copy, then paste — a phone number, an address, an order number', 'Copiar, luego pegar — un teléfono, una dirección, un número de orden')],
        [b('Ctrl + Z', 'Ctrl + Z'), b('Undo the last thing you typed', 'Deshacer lo último que escribiste')],
        [b('Ctrl + F', 'Ctrl + F'), b('Find a word on the page', 'Buscar una palabra en la página')],
        [b('Ctrl + T / Ctrl + W', 'Ctrl + T / Ctrl + W'), b('Open a new tab / close this tab', 'Abrir una pestaña nueva / cerrar esta pestaña')],
        [b('Ctrl + click a link', 'Ctrl + clic en un enlace'), b('Open it in a new tab, keeping this page', 'Abrirlo en otra pestaña, sin perder esta página')],
        [b('Windows + Shift + S', 'Windows + Shift + S'), b('Take a screenshot of part of the screen — then paste it in chat with Ctrl + V', 'Tomar captura de una parte de la pantalla — luego pégala en el chat con Ctrl + V')],
        [b('Alt + Tab', 'Alt + Tab'), b('Switch between open programs', 'Cambiar entre programas abiertos')],
      ],
    },
    {
      id: 'safety',
      title: b('Staying safe', 'Mantenerte seguro'),
      points: [
        b('Nobody from TTL will ever ask for your password by email, chat or phone.', 'Nadie de TTL te pedirá nunca tu contraseña por correo, chat o teléfono.'),
        b('An email asking you to "verify your account", pay an urgent invoice, or change a carrier’s bank details is a warning sign. Ask before you click.', 'Un correo que te pide "verificar tu cuenta", pagar una factura urgente o cambiar los datos bancarios de un transportista es una señal de alerta. Pregunta antes de hacer clic.'),
        b('Lock your computer when you walk away: Windows + L.', 'Bloquea tu computadora cuando te levantes: Windows + L.'),
        b('Stuck or something broken? IT support in the sidebar. Add a screenshot.', '¿Atorado o algo no funciona? Soporte de TI en la barra lateral. Agrega una captura.'),
      ],
    },
  ],
};
