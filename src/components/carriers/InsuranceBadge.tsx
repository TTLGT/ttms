import type { Timestamp } from 'firebase/firestore';
import { getInsuranceStatus } from '@/types/carrier';

const STYLES = {
  active:         'bg-green-100 text-green-700',
  expiring_soon:  'bg-yellow-100 text-yellow-700',
  expired:        'bg-red-100 text-red-600',
  unknown:        'bg-gray-100 text-gray-500',
};

const LABELS = {
  active:         'Active',
  expiring_soon:  'Exp. Soon',
  expired:        'Expired',
  unknown:        'No Insurance',
};

export default function InsuranceBadge({
  expiration,
}: {
  expiration: Timestamp | null | undefined;
}) {
  const status = getInsuranceStatus(expiration);
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
