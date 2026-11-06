import type { Bilingual, OnboardingTrack } from '@/types/onboarding';

/**
 * The shape of a guide in the Learn library.
 *
 * Content and drawing are kept apart on purpose. Every word lives in a guide
 * file under src/lib/onboarding/guides/ as plain data; the pictures are drawn
 * screens in src/components/onboarding/screens/, referred to by id. When the
 * site is redesigned, a screen is redrawn in one place and the words that
 * explain it do not move — and a screen that a redesign removes is found by
 * searching for its id.
 *
 * A step points at a numbered marker on its section's screen with `spot`.
 * Clicking the step lights the marker; clicking the marker lights the step.
 */

export type GuideGroup = 'start' | 'app' | 'freight' | 'sales' | 'leadership';

export const GUIDE_GROUP_LABEL: Record<GuideGroup, Bilingual> = {
  start:      { en: 'Start here',            es: 'Empieza aquí' },
  app:        { en: 'Using TTMS',            es: 'Cómo usar TTMS' },
  freight:    { en: 'Freight and logistics', es: 'Transporte y logística' },
  sales:      { en: 'Selling and planning',  es: 'Ventas y planificación' },
  leadership: { en: 'Leading a team',        es: 'Liderar un equipo' },
};

/** Icons by name, so a guide file does not import React. Mapped in GuideIcon.tsx. */
export type GuideIconName =
  | 'chat' | 'tasks' | 'calendar' | 'directory' | 'quote' | 'truck'
  | 'phone' | 'search' | 'alert' | 'target' | 'users' | 'compass';

export interface GuideStep {
  text: Bilingual;
  /** The numbered marker on this section's screen that the step is about. */
  spot?: number;
}

export type CalloutTone = 'tip' | 'warn' | 'why' | 'example';

export interface GuideCallout {
  tone: CalloutTone;
  text: Bilingual;
}

export interface GuideTerm {
  term: string;
  meaning: Bilingual;
}

export interface GuideSection {
  id: string;
  title: Bilingual;
  intro?: Bilingual;
  /** A drawn screen from src/components/onboarding/screens. */
  screen?: string;
  /** Numbered, in order: "click this, then this". */
  steps?: GuideStep[];
  /** Unordered points, for things that are not a sequence. */
  points?: Bilingual[];
  /** A small table: first row is the heading. */
  table?: Bilingual[][];
  /** Word list, for the freight vocabulary. */
  terms?: GuideTerm[];
  callouts?: GuideCallout[];
}

export interface QuizQuestion {
  q: Bilingual;
  options: Bilingual[];
  /** Index into options. */
  answer: number;
  why: Bilingual;
}

export interface GuideFaq {
  q: Bilingual;
  a: Bilingual;
}

export interface Guide {
  id: string;
  group: GuideGroup;
  icon: GuideIconName;
  title: Bilingual;
  summary: Bilingual;
  /** Rough reading time, minutes. */
  minutes: number;
  /** Where to practise it in TTMS. */
  tryHref?: string;
  /** Who it is for. Everybody can read everything; this only decides what is suggested. */
  tracks: 'all' | readonly OnboardingTrack[];
  sections: GuideSection[];
  faq?: GuideFaq[];
  /** A short quick check at the end. Passing is not required to finish. */
  quiz?: QuizQuestion[];
}

/** Shorthand for writing guide files. */
export const b = (en: string, es: string): Bilingual => ({ en, es });
