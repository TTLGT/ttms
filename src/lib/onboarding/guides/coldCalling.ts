import { b, type Guide } from '../guideTypes';

export const COLD_CALLING_GUIDE: Guide = {
  id: 'cold-calling',
  group: 'sales',
  icon: 'phone',
  title: b('Cold calling', 'Cold calling'),
  summary: b(
    'How to start a call with a stranger, present TTL, ask the right questions, handle "no", and leave every call with a next step.',
    'Cómo empezar una llamada con un desconocido, presentar TTL, hacer las preguntas correctas, manejar el "no" y terminar cada llamada con un siguiente paso.',
  ),
  minutes: 20,
  tracks: ['broker', 'salesManager'],
  sections: [
    {
      id: 'mindset',
      title: b('Before you dial', 'Antes de marcar'),
      points: [
        b('A cold call is not about selling a load today. It is about earning the next conversation.', 'Una llamada en frío no es para vender una carga hoy. Es para ganarte la siguiente conversación.'),
        b('Most calls go to voicemail or end in "not now". That is normal. The brokers who win are the ones who keep calling, every day, kindly.', 'La mayoría de las llamadas van al buzón o terminan en "ahora no". Es normal. Ganan los brokers que siguen llamando, todos los días, con amabilidad.'),
        b('Have your list ready, a glass of water, and TTMS open to write notes as you talk.', 'Ten tu lista lista, un vaso de agua y TTMS abierto para tomar notas mientras hablas.'),
        b('Stand up or smile. People hear it.', 'Ponte de pie o sonríe. La gente lo nota.'),
      ],
    },
    {
      id: 'script',
      title: b('A simple call, in five parts', 'Una llamada sencilla, en cinco partes'),
      screen: 'call-flow',
      steps: [
        { spot: 1, text: b('Open: "Hi, this is Ana with Total Transport Logistics. Did I catch you at a bad time?" — short, friendly, gives them a way out.', 'Apertura: "Hi, this is Ana with Total Transport Logistics. Did I catch you at a bad time?" — corto, amable, le da una salida.') },
        { spot: 2, text: b('Reason: "We help companies like yours move [equipment / freight] across the US — I wanted to see how you handle your shipping today."', 'Motivo: "We help companies like yours move [equipment / freight] across the US — I wanted to see how you handle your shipping today."') },
        { spot: 3, text: b('Questions: what do you ship, how often, where to, who do you use now, what would you change?', 'Preguntas: ¿qué envían, qué tan seguido, a dónde, con quién trabajan ahora, qué cambiarían?') },
        { spot: 4, text: b('Offer: "Next time you have something moving, send it my way and I will get you a price within the hour."', 'Oferta: "Next time you have something moving, send it my way and I will get you a price within the hour."') },
        { spot: 5, text: b('Next step: an email to send rates to, a day to call back, or a load to quote. Write it in TTMS before the next call.', 'Siguiente paso: un correo para mandar tarifas, un día para volver a llamar, o una carga para cotizar. Escríbelo en TTMS antes de la siguiente llamada.') },
      ],
      callouts: [
        { tone: 'tip', text: b('Listen more than you talk. If they talk for 60% of the call, it is going well.', 'Escucha más de lo que hablas. Si ellos hablan el 60% de la llamada, va bien.') },
      ],
    },
    {
      id: 'objections',
      title: b('When they say no', 'Cuando dicen que no'),
      table: [
        [b('They say', 'Dicen'), b('You can say', 'Puedes decir')],
        [b('"We already have a broker."', '"We already have a broker."'), b('"That makes sense. Most of my clients did too. Could I be your backup for the loads they cannot cover?"', '"That makes sense. Most of my clients did too. Could I be your backup for the loads they cannot cover?"')],
        [b('"Send me an email."', '"Send me an email."'), b('"Happy to. So I send the right thing — what do you usually ship, and where to?"', '"Happy to. So I send the right thing — what do you usually ship, and where to?"')],
        [b('"Your price is too high."', '"Your price is too high."'), b('"I understand. What are you paying now for that lane? Let me see what I can do — and the carrier we pick is vetted and insured."', '"I understand. What are you paying now for that lane? Let me see what I can do — and the carrier we pick is vetted and insured."')],
        [b('"We do not ship much."', '"We do not ship much."'), b('"No problem. When you do, even once, I would love to help. Can I check back in a month?"', '"No problem. When you do, even once, I would love to help. Can I check back in a month?"')],
        [b('"Not interested."', '"Not interested."'), b('"Understood — thank you for your time. Is there someone else there who handles shipping?"', '"Understood — thank you for your time. Is there someone else there who handles shipping?"')],
      ],
      callouts: [
        { tone: 'why', text: b('An objection is usually "not yet", not "never". Agree, ask a question, offer something small.', 'Una objeción casi siempre es "todavía no", no "nunca". Coincide, haz una pregunta, ofrece algo pequeño.') },
      ],
    },
    {
      id: 'voicemail',
      title: b('Voicemail and follow-up', 'Buzón de voz y seguimiento'),
      points: [
        b('Voicemail in 20 seconds: your name, TTL, why you called, your number twice. "Hi Mike, Ana with Total Transport Logistics, we move equipment like yours — call me at 555-123-4567, again 555-123-4567."', 'Buzón en 20 segundos: tu nombre, TTL, por qué llamaste, tu número dos veces. "Hi Mike, Ana with Total Transport Logistics, we move equipment like yours — call me at 555-123-4567, again 555-123-4567."'),
        b('Follow up several times, spaced out: a call, an email two days later, a call a week later, then monthly. Stop when they say stop.', 'Da seguimiento varias veces, con espacio: una llamada, un correo dos días después, una llamada una semana después, luego cada mes. Detente cuando digan que pares.'),
        b('Every follow-up is a task in TTMS with a date.', 'Cada seguimiento es una tarea en TTMS con fecha.'),
      ],
    },
    {
      id: 'numbers',
      title: b('Your numbers', 'Tus números'),
      intro: b('Your team lead will set your targets. As a starting point, track these every day:', 'Tu líder pondrá tus metas. Como punto de partida, registra esto cada día:'),
      points: [
        b('Dials made.', 'Llamadas hechas.'),
        b('Conversations (a real person who talked to you).', 'Conversaciones (una persona real que habló contigo).'),
        b('New prospects added to TTMS.', 'Prospectos nuevos agregados a TTMS.'),
        b('Quotes sent.', 'Cotizaciones enviadas.'),
        b('Loads booked.', 'Cargas cerradas.'),
      ],
      callouts: [
        { tone: 'tip', text: b('Steady beats heroic. Sixty calls every day are worth far more than two hundred on Monday and none the rest of the week.', 'Constante gana a heroico. Sesenta llamadas todos los días valen mucho más que doscientas el lunes y ninguna el resto de la semana.') },
        { tone: 'why', text: b('Numbers in brokerage training material vary a lot (from a handful of calls to hundreds a day). The ones that matter are the ones your team lead agrees with you, measured every week.', 'Los números en el material de capacitación varían mucho (de unas pocas llamadas a cientos por día). Los que importan son los que acuerdas con tu líder, medidos cada semana.') },
      ],
    },
  ],
  quiz: [
    { q: b('Every call should end with…', 'Cada llamada debe terminar con…'),
      options: [b('A sale', 'Una venta'), b('A next step written in TTMS', 'Un siguiente paso escrito en TTMS'), b('A discount', 'Un descuento')],
      answer: 1, why: b('The goal of a cold call is the next conversation.', 'La meta de una llamada en frío es la siguiente conversación.') },
    { q: b('"We already have a broker." A good answer is…', '"We already have a broker." Una buena respuesta es…'),
      options: [b('"Ours is better."', '"El nuestro es mejor."'), b('"Could I be your backup?"', '"¿Puedo ser tu respaldo?"'), b('Hang up', 'Colgar')],
      answer: 1, why: b('Being the backup is how most new clients start.', 'Ser el respaldo es como empiezan la mayoría de los clientes nuevos.') },
  ],
};
