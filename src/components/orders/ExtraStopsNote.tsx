import { extraStopCount } from '@/types/order';
import type { Order } from '@/types/order';

/**
 * "+2 stops" beside a lane on a list. A list shows a load as first pickup →
 * first delivery; this is what says there is more to the route than that.
 * Renders nothing for the ordinary one-pickup, one-delivery load.
 */
export default function ExtraStopsNote({ order }: { order: Pick<Order, 'extraPickups' | 'extraDeliveries'> }) {
  const n = extraStopCount(order);
  if (!n) return null;
  return (
    <span className="ml-1.5 inline-block rounded bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700 whitespace-nowrap">
      +{n} {n === 1 ? 'stop' : 'stops'}
    </span>
  );
}
