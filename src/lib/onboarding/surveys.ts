import type { Bilingual } from '@/types/onboarding';

/**
 * The onboarding surveys, from HR's plan: section 12 (end of week 1 — the
 * hiring process and training) and section 13 (end of month 1 — the
 * onboarding experience). The 90-day stay interview is not here: HR already
 * has a format for it and does it face to face, so it is a checklist step.
 *
 * Answers are readable only by `onboarding.manage` — see src/types/onboarding.ts.
 *
 * **A question id is forever** once anybody has answered it: answers are
 * stored under it. Reword freely; add new ids for new questions.
 */

export type SurveyQuestion =
  | { id: string; kind: 'rating'; text: Bilingual }
  | { id: string; kind: 'text'; text: Bilingual };

export interface SurveySection {
  title: Bilingual;
  questions: SurveyQuestion[];
}

export interface Survey {
  id: string;
  title: Bilingual;
  when: Bilingual;
  intro: Bilingual;
  sections: SurveySection[];
}

const r = (id: string, en: string, es: string): SurveyQuestion => ({ id, kind: 'rating', text: { en, es } });
const t = (id: string, en: string, es: string): SurveyQuestion => ({ id, kind: 'text', text: { en, es } });

export const RATING_LABELS: Bilingual[] = [
  { en: 'Not at all', es: 'Para nada' },
  { en: 'A little',   es: 'Poco' },
  { en: 'Somewhat',   es: 'Más o menos' },
  { en: 'Mostly',     es: 'Bastante' },
  { en: 'Completely', es: 'Totalmente' },
];

export const SURVEYS: Survey[] = [
  {
    id: 'week1',
    title: { en: 'Week one: hiring and training', es: 'Semana 1: selección y training' },
    when:  { en: 'At the end of training week', es: 'Al final de la semana de training' },
    intro: {
      en: 'Tell us honestly how the interview, the hiring process and training went. Only HR reads the answers, and they are used to make the next group’s first week better.',
      es: 'Cuéntanos con honestidad cómo fueron la entrevista, el proceso de selección y el training. Solo RR. HH. lee las respuestas, y se usan para mejorar la primera semana del siguiente grupo.',
    },
    sections: [
      {
        title: { en: 'The interview and hiring', es: 'La entrevista y la selección' },
        questions: [
          r('rs-clear',     'The information in the interview was clear.', 'La información de la entrevista fue clara.'),
          r('rs-match',     'The job I was told about matches the job I have seen.', 'Las funciones explicadas corresponden con las que he conocido.'),
          r('rs-schedule',  'The schedule was explained correctly.', 'El horario fue explicado correctamente.'),
          r('rs-interview', 'My experience in the interview was good.', 'Mi experiencia en la entrevista fue buena.'),
          r('rs-hr-comms',  'HR communicated well with me.', 'La comunicación de RR. HH. fue buena.'),
          r('rs-expect',    'The hiring process met my expectations.', 'El proceso de selección cumplió mis expectativas.'),
          t('rs-unclear',   'Was there anything that should have been explained better?', '¿Hubo información que debió explicarse mejor?'),
          t('rs-improve',   'What would you improve in the hiring process?', '¿Qué mejorarías del proceso de reclutamiento y selección?'),
        ],
      },
      {
        title: { en: 'Training', es: 'El training' },
        questions: [
          r('tr-organised', 'Training was well organised.', 'El training estuvo bien organizado.'),
          r('tr-clear',     'The topics were explained clearly.', 'Los temas fueron explicados de manera clara.'),
          r('tr-materials', 'The materials helped me learn.', 'Los materiales fueron útiles para mi aprendizaje.'),
          r('tr-examples',  'The examples helped me understand.', 'Los ejemplos ayudaron a comprender mejor.'),
          r('tr-balance',   'There was a good balance of theory and practice.', 'Hubo buen equilibrio entre teoría y práctica.'),
          r('tr-practice',  'The practice helped me understand the broker’s job.', 'Las prácticas me ayudaron a comprender el trabajo de broker.'),
          r('tr-coldcall',  'Cold calling practice prepared me for real calls.', 'El cold calling me preparó para el trabajo real.'),
          r('tr-sbs',       'The side by side helped me see how a broker works.', 'El side by side me ayudó a ver cómo trabaja un broker.'),
          r('tr-time',      'The time given to each topic was right.', 'El tiempo destinado a cada tema fue adecuado.'),
          r('tr-trainer',   'The trainer supported me well.', 'El trainer me acompañó bien.'),
          r('tr-ready',     'Training prepared me to start on the floor.', 'El training me preparó para empezar en piso.'),
          t('tr-deeper',    'Which topic needs more depth?', '¿Qué tema debería explicarse con mayor profundidad?'),
          t('tr-shorter',   'Which topic could be shorter or changed?', '¿Qué tema podría reducirse o modificarse?'),
        ],
      },
    ],
  },
  {
    id: 'month1',
    title: { en: 'Month one: your onboarding', es: 'Mes 1: tu onboarding' },
    when:  { en: 'At the end of your first month', es: 'Al final de tu primer mes' },
    intro: {
      en: 'A month in: how was the welcome, the support and the team? Only HR reads the answers.',
      es: 'Un mes después: ¿cómo fueron la bienvenida, el acompañamiento y el equipo? Solo RR. HH. lee las respuestas.',
    },
    sections: [
      {
        title: { en: 'Your first month', es: 'Tu primer mes' },
        questions: [
          r('ob-welcome',  'I felt welcome at TTL.', 'Me sentí bien recibido en TTL.'),
          r('ob-prepared', 'Training prepared me properly.', 'El training me preparó adecuadamente.'),
          r('ob-materials','The materials were useful.', 'Los materiales fueron útiles.'),
          r('ob-mentors',  'Practising with experienced brokers was useful.', 'La práctica con brokers experimentados fue útil.'),
          r('ob-sbs',      'The side by side helped me understand the work.', 'El side by side ayudó a comprender mejor el trabajo.'),
          r('ob-support',  'I felt supported in my first weeks.', 'Me sentí acompañado durante las primeras semanas.'),
          r('ob-who',      'I know who to go to when I have a question.', 'Sé a quién acudir cuando tengo dudas.'),
          r('ob-tools',    'The tools were explained properly.', 'Las herramientas fueron explicadas correctamente.'),
          r('ob-role',     'I understand what my job is.', 'Tengo claras mis funciones.'),
          r('ob-team',     'Lunches and games helped me get to know the team.', 'Los almuerzos y juegos me ayudaron a integrarme al equipo.'),
          t('ob-best',     'Which part of onboarding was most useful?', '¿Qué parte del onboarding fue más útil?'),
          t('ob-improve',  'Which part should improve?', '¿Qué parte debería mejorar?'),
          t('ob-more',     'Which topic needs more training?', '¿Qué tema necesita mayor capacitación?'),
        ],
      },
    ],
  },
];

export function surveyById(id: string): Survey | undefined {
  return SURVEYS.find((s) => s.id === id);
}

export function surveyQuestionIds(s: Survey): string[] {
  return s.sections.flatMap((sec) => sec.questions.map((q) => q.id));
}
