'use client';

import {
  IT_STATUS_LABEL,
  PRIORITY_LABEL,
  REPORTER_STATUS_LABEL,
  type ItTicketPriority,
  type ItTicketStatus,
} from '@/types/itTicket';

export const STATUS_STYLE: Record<ItTicketStatus, string> = {
  new:         'bg-blue-50 text-blue-700 ring-blue-200',
  in_progress: 'bg-amber-50 text-amber-700 ring-amber-200',
  waiting:     'bg-purple-50 text-purple-700 ring-purple-200',
  resolved:    'bg-green-50 text-green-700 ring-green-200',
  closed:      'bg-gray-100 text-gray-600 ring-gray-200',
};

export const PRIORITY_STYLE: Record<ItTicketPriority, string> = {
  urgent: 'bg-red-600 text-white ring-red-600',
  high:   'bg-orange-50 text-orange-700 ring-orange-200',
  normal: 'bg-gray-50 text-gray-600 ring-gray-200',
  low:    'bg-gray-50 text-gray-500 ring-gray-200',
};

export function StatusChip({ status, desk }: { status: ItTicketStatus; desk: boolean }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${STATUS_STYLE[status]}`}>
      {(desk ? IT_STATUS_LABEL : REPORTER_STATUS_LABEL)[status]}
    </span>
  );
}

export function PriorityChip({ priority }: { priority: ItTicketPriority }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${PRIORITY_STYLE[priority]}`}>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}
