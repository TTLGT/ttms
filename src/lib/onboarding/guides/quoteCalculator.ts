import { b, type Guide } from '../guideTypes';

export const QUOTE_GUIDE: Guide = {
  id: 'quote-calculator',
  group: 'app',
  icon: 'quote',
  title: b('Quote calculator', 'Calculadora de cotizaciones'),
  summary: b(
    'Price a load in five steps: the distance, the freight, the truck, the price to the client, and what the driver is paid — and see your broker fee before you say a number.',
    'Cotiza una carga en cinco pasos: la distancia, la carga, el camión, el precio al cliente y lo que se le paga al conductor — y mira tu comisión antes de decir un número.',
  ),
  minutes: 12,
  tryHref: '/dashboard/quote-calculator',
  tracks: ['broker', 'salesManager'],
  sections: [
    {
      id: 'idea',
      title: b('The idea in one picture', 'La idea en una imagen'),
      intro: b(
        'The client pays TTL. TTL pays the carrier (the driver). What is left in the middle is the broker fee — TTL’s money for finding the truck and running the load.',
        'El cliente le paga a TTL. TTL le paga al transportista (el conductor). Lo que queda en medio es la comisión del broker — el dinero de TTL por encontrar el camión y manejar la carga.',
      ),
      screen: 'money-flow',
      callouts: [
        { tone: 'example', text: b('Client pays $2,000. Driver is paid $1,700. Broker fee: $300 — that is 15% of the price.', 'El cliente paga $2,000. Al conductor se le pagan $1,700. Comisión: $300 — eso es 15% del precio.') },
        { tone: 'warn', text: b('Nothing the calculator works out is saved. It is a scratch pad: the order is what records the price.', 'Nada de lo que calcula se guarda. Es una hoja de borrador: la orden es la que registra el precio.') },
      ],
    },
    {
      id: 'steps',
      title: b('Price a load, step by step', 'Cotiza una carga, paso a paso'),
      screen: 'quote-calculator',
      steps: [
        { spot: 1, text: b('1 · Distance. Type the Pickup ZIP and the Delivery ZIP (five digits each). TTMS works out the miles. Or choose Type it and enter the distance yourself.', '1 · Distancia. Escribe el ZIP de recogida y el ZIP de entrega (cinco dígitos cada uno). TTMS calcula las millas. O elige Escribirla y pon tú la distancia.') },
        { spot: 2, text: b('2 · Freight. Length, width, height and weight, in the units the client gave you — pick the unit; TTMS converts.', '2 · Carga. Largo, ancho, alto y peso, en las unidades que te dio el cliente — elige la unidad; TTMS convierte.') },
        { spot: 3, text: b('3 · Truck. Each truck on the rate card says Fits, Too big or Not checked against your freight. Pick the truck you will book.', '3 · Camión. Cada camión de la tabla dice Cabe, Muy grande o Sin revisar según tu carga. Elige el camión que vas a reservar.') },
        { spot: 4, text: b('4 · Price. The card suggests a range. Slide between Low, Mid and High to choose where to price, or type the Price to the client.', '4 · Precio. La tabla sugiere un rango. Desliza entre Bajo, Medio y Alto para elegir dónde cotizar, o escribe el Precio al cliente.') },
        { spot: 5, text: b('5 · Driver and fee. Type the Driver pay. The Broker fee shows straight away, and whether it is at or under the company’s target.', '5 · Conductor y comisión. Escribe el Pago al conductor. La comisión aparece al instante, y si está en la meta de la empresa o por debajo.') },
        { spot: 6, text: b('The chips under Driver pay fill it for you: Market (the national average for that truck × the miles) or Leave the target fee.', 'Los botones bajo Pago al conductor lo llenan por ti: Mercado (el promedio nacional de ese camión × las millas) o Dejar la comisión meta.') },
      ],
      callouts: [
        { tone: 'why', text: b('The miles from ZIP codes are an estimate, usually within about 5%. Mountain routes can be further off. It always says "estimate" so nobody bills per mile against it.', 'Las millas por ZIP son un estimado, normalmente dentro de un 5%. Las rutas de montaña pueden variar más. Siempre dice "estimado" para que nadie cobre por milla con eso.') },
        { tone: 'warn', text: b('If the company uses Google for distances, a lane nobody has looked up before waits for you to press "Look up with Google" — each new lane costs money.', 'Si la empresa usa Google para las distancias, una ruta que nadie ha buscado antes espera a que presiones "Buscar con Google" — cada ruta nueva cuesta dinero.') },
        { tone: 'tip', text: b('A truck priced by the hour (the Landoll, booked for its winch and tilt bed) asks for Hours — how long the job takes — instead of miles. A tow truck adds a hook-up fee.', 'Un camión que se cobra por hora (el Landoll, que se reserva por su winche y su plataforma inclinable) pide Horas — cuánto dura el trabajo — en lugar de millas. Una grúa suma una tarifa de enganche.') },
        { tone: 'tip', text: b('"No truck takes this freight as entered" usually means oversize: it may need a permit or a special trailer. Ask dispatch before you quote.', '"Ningún camión lleva esta carga así" suele significar sobredimensión: puede necesitar un permiso o un remolque especial. Pregunta a despacho antes de cotizar.') },
      ],
    },
    {
      id: 'market',
      title: b('Reading the market check', 'Cómo leer la comparación con el mercado'),
      points: [
        b('Under the fee, TTMS compares the driver’s pay per mile with DAT’s weekly national average for that kind of truck.', 'Bajo la comisión, TTMS compara el pago por milla del conductor con el promedio nacional semanal de DAT para ese tipo de camión.'),
        b('Far above the market: you may be overpaying. Far below: the carrier may not take it, or may cancel.', 'Muy por encima del mercado: puede que estés pagando de más. Muy por debajo: el transportista puede no aceptarla, o cancelar.'),
        b('A national average says nothing about one lane. It is a sanity check, not a price.', 'Un promedio nacional no dice nada de una ruta en particular. Es una revisión de sentido común, no un precio.'),
      ],
    },
    {
      id: 'uship',
      title: b('Direct or uShip', 'Directo o uShip'),
      points: [
        b('Choose Direct for a client paying TTL, or uShip for a load booked through uShip.', 'Elige Directo para un cliente que le paga a TTL, o uShip para una carga reservada por uShip.'),
        b('In uShip mode, type the Total in uShip. TTMS takes off uShip’s cut (the percentage an admin set, or the one you type) before working out your fee.', 'En modo uShip, escribe el Total en uShip. TTMS resta la parte de uShip (el porcentaje que puso un administrador, o el que escribas) antes de calcular tu comisión.'),
      ],
    },
    {
      id: 'from-order',
      title: b('Using it from an order', 'Usarla desde una orden'),
      steps: [
        { text: b('On a new or existing order, open Price and Terms and press the calculator button.', 'En una orden nueva o existente, abre Precio y condiciones y presiona el botón de la calculadora.') },
        { text: b('It opens already filled with the order’s miles and freight. Change anything.', 'Se abre ya llena con las millas y la carga de la orden. Cambia lo que quieras.') },
        { text: b('Press Apply to order. It fills Agreed Rate and Broker Fee in the form.', 'Presiona Aplicar a la orden. Llena la Tarifa acordada y la Comisión en el formulario.') },
        { text: b('Save the order as usual. Until you save, nothing has changed.', 'Guarda la orden como siempre. Hasta que guardes, nada ha cambiado.') },
      ],
    },
    {
      id: 'rates',
      title: b('Who sets the rates', 'Quién pone las tarifas'),
      points: [
        b('The rate card — prices per truck, truck sizes, the target fee and the market figures — is kept by an admin in Settings → Operations → Quote Rates.', 'La tabla — precios por camión, tamaños, la comisión meta y las cifras del mercado — la mantiene un administrador en Configuración → Operaciones → Tarifas de cotización.'),
        b('If a rate looks out of date, tell your team lead. Do not quote around it.', 'Si una tarifa se ve desactualizada, avísale a tu líder. No cotices ignorándola.'),
      ],
    },
  ],
  faq: [
    { q: b('The client gave me centimetres and kilos.', 'El cliente me dio centímetros y kilos.'),
      a: b('Pick cm and kg as the units. TTMS converts for the fit check.', 'Elige cm y kg como unidades. TTMS convierte para revisar si cabe.') },
    { q: b('The fee is red.', 'La comisión está en rojo.'),
      a: b('The driver costs more than the client pays, or the fee is under the target. Raise the price, find a cheaper truck, or ask your team lead.', 'El conductor cuesta más de lo que paga el cliente, o la comisión está bajo la meta. Sube el precio, busca un camión más barato o pregunta a tu líder.') },
  ],
  quiz: [
    { q: b('Client pays $1,500, driver gets $1,250. What is the broker fee?', 'El cliente paga $1,500 y al conductor se le pagan $1,250. ¿Cuál es la comisión?'),
      options: [b('$250', '$250'), b('$1,250', '$1,250'), b('$2,750', '$2,750')],
      answer: 0, why: b('Price minus driver pay: 1,500 − 1,250 = 250.', 'Precio menos pago al conductor: 1,500 − 1,250 = 250.') },
    { q: b('You pressed Apply to order. Is the price saved?', 'Presionaste Aplicar a la orden. ¿Ya se guardó el precio?'),
      options: [b('Yes', 'Sí'), b('Only after you save the order', 'Solo después de guardar la orden')],
      answer: 1, why: b('Apply fills the form; saving the order records it.', 'Aplicar llena el formulario; guardar la orden lo registra.') },
  ],
};
