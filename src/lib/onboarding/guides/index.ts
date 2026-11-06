import type { Guide, GuideGroup } from '../guideTypes';
import type { OnboardingTrack } from '@/types/onboarding';
import { COMPUTER_BASICS_GUIDE } from './computerBasics';
import { CHAT_GUIDE } from './chat';
import { TASKS_GUIDE } from './tasks';
import { CALENDAR_GUIDE } from './calendar';
import { DIRECTORY_GUIDE } from './directory';
import { QUOTE_GUIDE } from './quoteCalculator';
import { FREIGHT_101_GUIDE } from './freight101';
import { DAMAGES_GUIDE } from './damages';
import { FINDING_SHIPPERS_GUIDE } from './findingShippers';
import { COLD_CALLING_GUIDE } from './coldCalling';
import { BROKER_PLANNING_GUIDE } from './brokerPlanning';
import { MANAGER_PLAYBOOK_GUIDE } from './managerPlaybook';

/**
 * The Learn library, in the order it is shown. Adding a guide: write its file
 * beside these, add it here, and — if a checklist step should be ticked by
 * finishing it — point that step's `guide` at its id.
 *
 * Guide ids are stored on people's programmes (`guides.{id}`), so an id is
 * forever, like a checklist step's.
 */
export const GUIDES: readonly Guide[] = [
  COMPUTER_BASICS_GUIDE,
  CHAT_GUIDE,
  TASKS_GUIDE,
  CALENDAR_GUIDE,
  DIRECTORY_GUIDE,
  QUOTE_GUIDE,
  FREIGHT_101_GUIDE,
  DAMAGES_GUIDE,
  FINDING_SHIPPERS_GUIDE,
  COLD_CALLING_GUIDE,
  BROKER_PLANNING_GUIDE,
  MANAGER_PLAYBOOK_GUIDE,
];

export const GUIDE_GROUP_ORDER: GuideGroup[] = ['start', 'app', 'freight', 'sales', 'leadership'];

export function guideById(id: string): Guide | undefined {
  return GUIDES.find((g) => g.id === id);
}

export function isGuideId(v: unknown): v is string {
  return typeof v === 'string' && GUIDES.some((g) => g.id === v);
}

export function guideForTrack(g: Guide, track: OnboardingTrack): boolean {
  return g.tracks === 'all' || g.tracks.includes(track);
}
