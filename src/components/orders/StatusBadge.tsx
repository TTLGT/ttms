import type { OrderStatus } from '@/types/order';
import { STATUS_LABEL } from '@/types/order';

const STYLES: Record<OrderStatus, string> = {
  quote:            'bg-gray-100 text-gray-600',
  booked:           'bg-blue-100 text-blue-700',
  carrier_assigned: 'bg-yellow-100 text-yellow-700',
  carrier_signed:   'bg-orange-100 text-orange-700',
  shipper_signed:   'bg-purple-100 text-purple-700',
  in_transit:       'bg-cyan-100 text-cyan-700',
  delivered:        'bg-green-100 text-green-700',
  completed:        'bg-emerald-100 text-emerald-800',
  cancelled:        'bg-red-100 text-red-600',
};

export default function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STYLES[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
