import { b, type Guide } from '../guideTypes';

/**
 * Written as general freight practice. HR's plan has Dispatch teach this in
 * training week; Dispatch should check every line against how TTL actually
 * handles a claim and correct it here — the wording is theirs to own.
 */
export const DAMAGES_GUIDE: Guide = {
  id: 'damages',
  group: 'freight',
  icon: 'alert',
  title: b('Damages', 'Damages (daños)'),
  summary: b(
    'What to do when freight arrives broken, short or not at all: what to tell the consignee, what to document, who does what, when to escalate, and how to stop it happening.',
    'Qué hacer cuando la carga llega rota, incompleta o no llega: qué decirle al consignee, qué documentar, quién hace qué, cuándo escalar y cómo evitar que pase.',
  ),
  minutes: 12,
  tracks: 'all',
  sections: [
    {
      id: 'what',
      title: b('What counts as a damage', 'Qué cuenta como daño'),
      terms: [
        { term: 'Visible damage', meaning: b('Broken, bent, wet or crushed, and you can see it at delivery.', 'Roto, doblado, mojado o aplastado, y se ve al entregar.') },
        { term: 'Concealed damage', meaning: b('Found after delivery, inside packaging that looked fine.', 'Se descubre después de la entrega, dentro de un empaque que se veía bien.') },
        { term: 'Shortage', meaning: b('Fewer pieces arrived than were loaded.', 'Llegaron menos piezas de las que se cargaron.') },
        { term: 'Loss', meaning: b('The freight never arrived.', 'La carga nunca llegó.') },
        { term: 'Exception', meaning: b('A note written on the BOL at delivery saying what was wrong.', 'Una nota escrita en el BOL al entregar que dice qué estaba mal.') },
      ],
    },
    {
      id: 'at-delivery',
      title: b('At delivery: the most important five minutes', 'En la entrega: los cinco minutos más importantes'),
      steps: [
        { text: b('Ask the consignee to inspect before they sign.', 'Pide al consignee que revise antes de firmar.') },
        { text: b('If anything is wrong, they write it on the BOL before signing: what, how many pieces, how bad. "2 of 10 pallets crushed."', 'Si algo está mal, lo escribe en el BOL antes de firmar: qué, cuántas piezas, qué tan grave. "2 de 10 tarimas aplastadas."') },
        { text: b('Pictures: the damage up close, the whole load, the trailer, the BOL with the note. The driver can add them on their link; you can add them to the load in TTMS.', 'Fotos: el daño de cerca, toda la carga, el remolque, el BOL con la nota. El conductor puede subirlas en su enlace; tú puedes agregarlas a la carga en TTMS.') },
        { text: b('Do not refuse freight unless dispatch says so. Refused freight becomes a much bigger problem.', 'No rechaces la carga a menos que despacho lo diga. Una carga rechazada se vuelve un problema mucho mayor.') },
      ],
      callouts: [
        { tone: 'warn', text: b('A clean signature with no note makes a claim very hard to win. The note on the BOL is the evidence.', 'Una firma limpia sin nota hace muy difícil ganar un reclamo. La nota en el BOL es la evidencia.') },
      ],
    },
    {
      id: 'report',
      title: b('Report it straight away', 'Repórtalo de inmediato'),
      intro: b('Post in the load’s room (Discuss on the order) and tell dispatch the same hour. Include:', 'Publica en la sala de la carga (Discutir en la orden) y avisa a despacho en la misma hora. Incluye:'),
      points: [
        b('The order number.', 'El número de orden.'),
        b('What happened, in plain words, and when.', 'Qué pasó, en palabras simples, y cuándo.'),
        b('The pictures and the signed BOL or POD with the note.', 'Las fotos y el BOL o POD firmado con la nota.'),
        b('How many pieces and what they are worth (the declared value on the BOL).', 'Cuántas piezas y cuánto valen (el valor declarado en el BOL).'),
        b('The carrier and driver, and what the driver said.', 'El transportista y el conductor, y lo que dijo el conductor.'),
      ],
    },
    {
      id: 'who',
      title: b('Who does what', 'Quién hace qué'),
      table: [
        [b('Who', 'Quién'), b('What they do', 'Qué hace')],
        [b('Broker', 'Bróker'), b('Tells the client calmly, collects pictures and paperwork, reports to dispatch, keeps the client updated. Never admits fault or promises payment.', 'Avisa al cliente con calma, junta fotos y documentos, reporta a despacho, mantiene al cliente informado. Nunca admite culpa ni promete pago.')],
        [b('Dispatch', 'Despacho'), b('Notifies the carrier in writing, opens the claim with the carrier and its insurance, follows it to the end.', 'Notifica al transportista por escrito, abre el reclamo con el transportista y su seguro, lo sigue hasta el final.')],
        [b('Finance', 'Finanzas'), b('Decides what happens to the carrier’s payment and the client’s invoice while the claim is open.', 'Decide qué pasa con el pago del transportista y la factura del cliente mientras el reclamo está abierto.')],
        [b('Management', 'Gerencia'), b('Decides anything outside the normal process.', 'Decide lo que está fuera del proceso normal.')],
      ],
    },
    {
      id: 'escalate',
      title: b('Escalate at once when', 'Escala de inmediato cuando'),
      points: [
        b('Anyone is hurt.', 'Alguien está herido.'),
        b('The freight is hazardous, or is leaking.', 'La carga es peligrosa, o está goteando.'),
        b('The value is high or the client is very upset.', 'El valor es alto o el cliente está muy molesto.'),
        b('The carrier stops answering, or the load is missing.', 'El transportista deja de contestar, o la carga está perdida.'),
        b('Anyone mentions a lawyer or the police.', 'Alguien menciona un abogado o la policía.'),
      ],
    },
    {
      id: 'follow',
      title: b('Following it through', 'Darle seguimiento'),
      points: [
        b('Claims take weeks, sometimes months. Keep a task with a date to check on it.', 'Los reclamos tardan semanas, a veces meses. Ten una tarea con fecha para revisarlo.'),
        b('In the US a cargo claim against a carrier generally has to be filed in writing within nine months of delivery. Do not wait.', 'En EE. UU. un reclamo de carga contra un transportista generalmente debe presentarse por escrito dentro de los nueve meses después de la entrega. No esperes.'),
        b('Everything in writing, in the load’s room or by email, so anyone can pick it up.', 'Todo por escrito, en la sala de la carga o por correo, para que cualquiera pueda continuarlo.'),
      ],
    },
    {
      id: 'prevent',
      title: b('Preventing it', 'Prevenirlo'),
      points: [
        b('Get the real description, dimensions and weight. A wrong description means a wrong truck.', 'Consigue la descripción real, las medidas y el peso. Una descripción equivocada es un camión equivocado.'),
        b('Ask how it is packed. Loose, unwrapped or top-heavy freight breaks.', 'Pregunta cómo está empacado. La carga suelta, sin envolver o pesada arriba se rompe.'),
        b('Book the right equipment: tarps for flatbed freight that must stay dry, straps and chains for machines, a reefer for anything cold.', 'Reserva el equipo correcto: lonas para carga en plataforma que deba estar seca, cinchos y cadenas para máquinas, un reefer para lo que deba estar frío.'),
        b('Ask for pictures at pickup, loaded and secured. They prove the condition it left in.', 'Pide fotos en la recogida, cargada y asegurada. Prueban cómo salió.'),
        b('Choose carriers with cargo insurance that covers the freight’s value.', 'Elige transportistas con seguro de carga que cubra el valor de la mercancía.'),
      ],
    },
  ],
  quiz: [
    { q: b('The consignee sees a crushed pallet. What happens before they sign?', 'El consignee ve una tarima aplastada. ¿Qué pasa antes de que firme?'),
      options: [b('They sign normally', 'Firma normal'), b('They write the damage on the BOL', 'Escribe el daño en el BOL'), b('They refuse everything', 'Rechaza todo')],
      answer: 1, why: b('The note on the BOL is the evidence for the claim.', 'La nota en el BOL es la evidencia del reclamo.') },
    { q: b('The client asks "Will you pay for it?" You say…', 'El cliente pregunta "¿Lo van a pagar?" Dices…'),
      options: [b('"Yes, of course."', '"Sí, claro."'), b('"We are documenting everything and dispatch is opening a claim; I will keep you updated."', '"Estamos documentando todo y despacho está abriendo un reclamo; te mantendré informado."')],
      answer: 1, why: b('Never promise payment or admit fault. Report and follow up.', 'Nunca prometas pago ni admitas culpa. Reporta y da seguimiento.') },
  ],
};
