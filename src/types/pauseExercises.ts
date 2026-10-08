/**
 * What the active pause asks people to do: three short desk exercises a day,
 * in English and Spanish, about five minutes together.
 *
 * **Hand-written and fixed, on purpose.** This is health advice going to the
 * whole company, so every line here is gentle, can be done in office clothes
 * beside a desk, and was written once and read — not generated per day. Add
 * to it freely; keep anything that needs the floor, equipment, or balance
 * without something to hold out of it. Nothing leans on a chair with wheels.
 *
 * The Spanish is `tú`, as the company asked (2026-10-08). Keep new lines
 * in the same register.
 *
 * **Everybody gets the same three on the same day**, so a room can do them
 * together. `exercisesFor()` walks the list three at a time, and the list is
 * ordered so any three in a row are three different parts of the body.
 */

export type BodyArea = 'neck' | 'shoulders' | 'wrists' | 'eyes' | 'back' | 'legs';

export interface Bilingual {
  en: string;
  es: string;
}

export interface PauseExercise {
  id: string;
  area: BodyArea;
  name: Bilingual;
  steps: { en: string[]; es: string[] };
}

/** Shown with every set. */
export const PAUSE_SAFETY: Bilingual = {
  en: 'Move gently, and skip anything that hurts.',
  es: 'Muévete con suavidad y omite cualquier ejercicio que te cause dolor.',
};

const NECK: PauseExercise[] = [
  {
    id: 'neck-side', area: 'neck',
    name: { en: 'Neck side stretch', es: 'Estiramiento lateral de cuello' },
    steps: {
      en: ['Sit tall and slowly tilt your right ear toward your right shoulder.', 'Hold for 15 seconds, breathing normally.', 'Repeat on the left. Do each side twice.'],
      es: ['Siéntate derecho e inclina despacio la oreja derecha hacia el hombro derecho.', 'Mantén 15 segundos, respirando con normalidad.', 'Repite del lado izquierdo. Haz cada lado dos veces.'],
    },
  },
  {
    id: 'chin-tuck', area: 'neck',
    name: { en: 'Chin tucks', es: 'Retracción de barbilla' },
    steps: {
      en: ['Sit tall, looking straight ahead.', 'Gently draw your chin straight back, as if making a double chin.', 'Hold 5 seconds, then relax. Repeat 10 times.'],
      es: ['Siéntate derecho, mirando al frente.', 'Lleva suavemente la barbilla hacia atrás, como si hicieras papada.', 'Mantén 5 segundos y relaja. Repite 10 veces.'],
    },
  },
  {
    id: 'neck-turn', area: 'neck',
    name: { en: 'Look over your shoulder', es: 'Mirar sobre el hombro' },
    steps: {
      en: ['Slowly turn your head to look over your right shoulder.', 'Hold 10 seconds, then turn to the left.', 'Repeat 3 times each side, without forcing.'],
      es: ['Gira despacio la cabeza para mirar sobre el hombro derecho.', 'Mantén 10 segundos y luego gira hacia la izquierda.', 'Repite 3 veces de cada lado, sin forzar.'],
    },
  },
];

const SHOULDERS: PauseExercise[] = [
  {
    id: 'shoulder-rolls', area: 'shoulders',
    name: { en: 'Shoulder rolls', es: 'Círculos de hombros' },
    steps: {
      en: ['Roll your shoulders backwards in big, slow circles, 10 times.', 'Then roll them forwards 10 times.', 'Keep your arms relaxed.'],
      es: ['Haz 10 círculos grandes y lentos con los hombros hacia atrás.', 'Luego haz 10 hacia adelante.', 'Mantén los brazos relajados.'],
    },
  },
  {
    id: 'shrugs', area: 'shoulders',
    name: { en: 'Shoulder shrugs', es: 'Encogimiento de hombros' },
    steps: {
      en: ['Lift both shoulders up toward your ears.', 'Hold 3 seconds, then let them drop and relax.', 'Repeat 10 times.'],
      es: ['Sube los dos hombros hacia las orejas.', 'Mantén 3 segundos y luego déjalos caer y relaja.', 'Repite 10 veces.'],
    },
  },
  {
    id: 'chest-opener', area: 'shoulders',
    name: { en: 'Chest opener', es: 'Apertura de pecho' },
    steps: {
      en: ['Clasp your hands behind your back.', 'Gently squeeze your shoulder blades together and lift your chest.', 'Hold 15 seconds. Repeat 3 times.'],
      es: ['Entrelaza las manos detrás de la espalda.', 'Junta suavemente los omóplatos y levanta el pecho.', 'Mantén 15 segundos. Repite 3 veces.'],
    },
  },
];

const WRISTS: PauseExercise[] = [
  {
    id: 'wrist-stretch', area: 'wrists',
    name: { en: 'Wrist stretch', es: 'Estiramiento de muñecas' },
    steps: {
      en: ['Hold one arm out in front, palm up.', 'With the other hand, gently pull your fingers back for 15 seconds.', 'Turn the palm down and gently press the back of the hand for 15 seconds. Switch hands.'],
      es: ['Extiende un brazo al frente con la palma hacia arriba.', 'Con la otra mano, lleva suavemente los dedos hacia atrás durante 15 segundos.', 'Gira la palma hacia abajo y presiona suavemente el dorso de la mano 15 segundos. Cambia de mano.'],
    },
  },
  {
    id: 'fist-spread', area: 'wrists',
    name: { en: 'Fist and spread', es: 'Cerrar y abrir las manos' },
    steps: {
      en: ['Make a gentle fist and hold for 3 seconds.', 'Open your hand and spread your fingers wide for 3 seconds.', 'Repeat 10 times with both hands.'],
      es: ['Cierra la mano suavemente en un puño y mantén 3 segundos.', 'Abre la mano y separa bien los dedos durante 3 segundos.', 'Repite 10 veces con ambas manos.'],
    },
  },
  {
    id: 'wrist-circles', area: 'wrists',
    name: { en: 'Wrist circles', es: 'Círculos de muñecas' },
    steps: {
      en: ['Hold your arms out in front, hands relaxed.', 'Circle your wrists slowly 10 times one way.', 'Then 10 times the other way.'],
      es: ['Pon los brazos al frente con las manos relajadas.', 'Haz 10 círculos lentos con las muñecas hacia un lado.', 'Luego 10 hacia el otro lado.'],
    },
  },
];

const EYES: PauseExercise[] = [
  {
    id: 'twenty-twenty', area: 'eyes',
    name: { en: '20-20-20 eye rest', es: 'Descanso visual 20-20-20' },
    steps: {
      en: ['Look away from the screen at something about 6 metres (20 feet) away.', 'Keep looking at it for 20 seconds.', 'Blink slowly a few times. Repeat 3 times.'],
      es: ['Aparta la vista de la pantalla y mira algo a unos 6 metros.', 'Sigue mirándolo durante 20 segundos.', 'Parpadea despacio varias veces. Repite 3 veces.'],
    },
  },
  {
    id: 'palming', area: 'eyes',
    name: { en: 'Palming', es: 'Descanso con las palmas' },
    steps: {
      en: ['Rub your hands together until they are warm.', 'Close your eyes and cup your palms over them, without pressing.', 'Breathe slowly for 30 seconds.'],
      es: ['Frota las manos hasta que estén tibias.', 'Cierra los ojos y cúbrelos con las palmas, sin presionar.', 'Respira despacio durante 30 segundos.'],
    },
  },
  {
    id: 'near-far', area: 'eyes',
    name: { en: 'Near and far focus', es: 'Enfoque cerca y lejos' },
    steps: {
      en: ['Hold your thumb about 25 cm in front of your face and focus on it for 10 seconds.', 'Then focus on something far away for 10 seconds.', 'Repeat 5 times.'],
      es: ['Pon el pulgar a unos 25 cm de la cara y enfócalo durante 10 segundos.', 'Luego enfoca algo lejano durante 10 segundos.', 'Repite 5 veces.'],
    },
  },
];

const BACK: PauseExercise[] = [
  {
    id: 'seated-twist', area: 'back',
    name: { en: 'Seated twist', es: 'Giro sentado' },
    steps: {
      en: ['Sit tall with both feet flat on the floor.', 'Turn your upper body to the right, holding the back of the chair, for 15 seconds.', 'Come back to the centre and repeat to the left. Twice each side.'],
      es: ['Siéntate derecho con los dos pies en el suelo.', 'Gira el torso hacia la derecha, sujetándote del respaldo, durante 15 segundos.', 'Vuelve al centro y repite hacia la izquierda. Dos veces de cada lado.'],
    },
  },
  {
    id: 'overhead-reach', area: 'back',
    name: { en: 'Overhead reach', es: 'Estiramiento hacia arriba' },
    steps: {
      en: ['Stand up and interlace your fingers.', 'Reach your arms above your head, palms to the ceiling.', 'Hold 15 seconds, breathing deeply. Repeat 3 times.'],
      es: ['Ponte de pie y entrelaza los dedos.', 'Estira los brazos por encima de la cabeza, con las palmas hacia el techo.', 'Mantén 15 segundos, respirando profundo. Repite 3 veces.'],
    },
  },
  {
    id: 'side-bend', area: 'back',
    name: { en: 'Side bend', es: 'Inclinación lateral' },
    steps: {
      en: ['Stand with your feet hip-width apart.', 'Raise your right arm overhead and lean gently to the left for 10 seconds.', 'Switch sides. Repeat twice each side.'],
      es: ['Ponte de pie con los pies separados al ancho de la cadera.', 'Levanta el brazo derecho por encima de la cabeza e inclínate suavemente hacia la izquierda 10 segundos.', 'Cambia de lado. Repite dos veces de cada lado.'],
    },
  },
];

const LEGS: PauseExercise[] = [
  {
    id: 'calf-raises', area: 'legs',
    name: { en: 'Calf raises', es: 'Elevación de talones' },
    steps: {
      en: ['Stand facing your desk with your hands on it for balance.', 'Rise slowly onto your toes, then lower your heels.', 'Repeat 15 times.'],
      es: ['Párate frente al escritorio con las manos apoyadas para mantener el equilibrio.', 'Sube despacio sobre las puntas de los pies y baja los talones.', 'Repite 15 veces.'],
    },
  },
  {
    id: 'march', area: 'legs',
    name: { en: 'March in place', es: 'Marcha en el sitio' },
    steps: {
      en: ['Stand up and march in place, lifting your knees.', 'Swing your arms naturally.', 'Keep going for 30 to 45 seconds.'],
      es: ['Ponte de pie y marcha en el sitio, levantando las rodillas.', 'Mueve los brazos con naturalidad.', 'Continúa de 30 a 45 segundos.'],
    },
  },
  {
    id: 'ankle-circles', area: 'legs',
    name: { en: 'Ankle circles', es: 'Círculos de tobillos' },
    steps: {
      en: ['Sitting down, lift one foot a little off the floor.', 'Circle your ankle 10 times each way.', 'Switch feet.'],
      es: ['Sentado, levanta un pie un poco del suelo.', 'Haz 10 círculos con el tobillo hacia cada lado.', 'Cambia de pie.'],
    },
  },
];

const GROUPS = [NECK, SHOULDERS, WRISTS, EYES, BACK, LEGS];

/**
 * Interleaved — neck, shoulders, wrists, eyes, back, legs, neck, … — so any
 * three in a row, wrapping round, are three different areas. That holds while
 * every group is the same size; add exercises a full round at a time.
 */
export const PAUSE_EXERCISES: PauseExercise[] = GROUPS[0].flatMap((_, i) => GROUPS.map((g) => g[i]));

export const EXERCISES_PER_PAUSE = 3;

/**
 * The day's set, from its office date: three in a row, starting five further
 * on each day. Five because it shares no factor with eighteen: every
 * exercise gets its turn equally often, the areas are grouped differently
 * from one day to the next (stepping by three would only ever pair neck,
 * shoulders and wrists, then eyes, back and legs), and the same set does not
 * come back for eighteen days. Change the list's length and check the step
 * still shares no factor with it.
 */
const DAILY_STEP = 5;

export function exercisesFor(date: string): PauseExercise[] {
  const [y, m, d] = date.split('-').map(Number);
  const day = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  const n = PAUSE_EXERCISES.length;
  const start = (((day * DAILY_STEP) % n) + n) % n;
  return Array.from({ length: EXERCISES_PER_PAUSE }, (_, i) => PAUSE_EXERCISES[(start + i) % n]);
}
