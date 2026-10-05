import {
  Anchor, BadgeCheck, BookOpen, ClipboardCheck, ClipboardList, Crown, Eye, FlaskConical, Flag, Flower2, Gem,
  Hourglass, Leaf, Map, MoonStar, Orbit, Package, Radar, Rocket, Sailboat, Satellite, Scroll, ScrollText, Shield,
  Sparkles, Sprout, Swords, Telescope, Timer, Truck, WandSparkles, type LucideIcon,
} from 'lucide-react';
import type { GameTheme } from '@/types/taskGame';
import type { BuiltInTaskStatus, TaskStatus } from '@/types/task';
import { statusDot } from './taskStyle';

/**
 * A column's mark: the coloured ring it has always had, and under a game
 * theme an icon from the theme's world beside it.
 *
 * The ring stays under every theme — sky is Ready and green is Done whatever
 * the costume, so somebody who switches theme still finds their columns by
 * colour. The icon is drawn in the same colour. A column the person added
 * has no icon in any theme and keeps just its dashed ring.
 */
const THEME_ICONS: Record<GameTheme, Record<BuiltInTaskStatus, LucideIcon>> = {
  freight:   { todo: ClipboardList, ready: Package,      doing: Truck,        waiting: Timer,     review: ClipboardCheck, done: BadgeCheck },
  wizarding: { todo: ScrollText,    ready: FlaskConical, doing: WandSparkles, waiting: Hourglass, review: BookOpen,       done: Sparkles },
  empire:    { todo: Scroll,        ready: Shield,       doing: Swords,       waiting: Hourglass, review: Eye,            done: Crown },
  fairy:     { todo: Sprout,        ready: Leaf,         doing: WandSparkles, waiting: MoonStar,  review: Eye,            done: Flower2 },
  space:     { todo: Satellite,     ready: Radar,        doing: Rocket,       waiting: Orbit,     review: Telescope,      done: Flag },
  pirate:    { todo: Map,           ready: Anchor,       doing: Sailboat,     waiting: Hourglass, review: Telescope,      done: Gem },
};

const STATUS_INK: Record<BuiltInTaskStatus, string> = {
  todo:    'text-gray-400',
  ready:   'text-sky-500',
  doing:   'text-amber-500',
  waiting: 'text-violet-500',
  review:  'text-pink-500',
  done:    'text-green-500',
};

export default function StatusMark({
  status,
  theme,
  size = 'md',
}: {
  status: TaskStatus;
  theme: GameTheme | null;
  size?: 'sm' | 'md';
}) {
  const Icon = theme ? THEME_ICONS[theme][status as BuiltInTaskStatus] : undefined;
  const ring = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3';
  return (
    <span className="inline-flex flex-shrink-0 items-center gap-1.5">
      <span className={`${ring} flex-shrink-0 rounded-full border-2 ${statusDot(status)}`} />
      {Icon && (
        <Icon
          size={size === 'sm' ? 14 : 16}
          strokeWidth={2.25}
          aria-hidden
          className={`flex-shrink-0 ${STATUS_INK[status as BuiltInTaskStatus]}`}
        />
      )}
    </span>
  );
}
