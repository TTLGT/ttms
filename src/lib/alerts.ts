import type { Order } from '@/types/order';
import { orderDisplayNumber } from '@/types/order';

export type AlertSeverity = 'critical' | 'warning';

export interface OrderAlert {
  orderId: string;
  orderNumber: string;
  shipperName: string;
  severity: AlertSeverity;
  message: string;
}

function hoursFromNow(ts: { toDate?: () => Date } | null | undefined): number | null {
  if (!ts || typeof ts.toDate !== 'function') return null;
  return (ts.toDate().getTime() - Date.now()) / (1000 * 60 * 60);
}

export function getAlerts(orders: Order[]): OrderAlert[] {
  const alerts: OrderAlert[] = [];

  for (const o of orders) {
    if (o.parentOrderId != null) continue;
    if (o.status === 'cancelled' || o.status === 'completed') continue;

    const pickup   = hoursFromNow(o.pickupDate   as { toDate: () => Date } | null);
    const delivery = hoursFromNow(o.deliveryDate as { toDate: () => Date } | null);

    // No carrier assigned — warn at 48h, critical at 24h
    if ((o.status === 'quote' || o.status === 'booked') && pickup !== null && pickup >= 0 && pickup <= 48) {
      alerts.push({
        orderId: o.id, orderNumber: orderDisplayNumber(o), shipperName: o.shipperName,
        severity: pickup <= 24 ? 'critical' : 'warning',
        message: `No carrier assigned — pickup in ${Math.round(pickup)}h`,
      });
      continue;
    }

    // Carrier not signed — warn at 48h, critical at 24h
    if (o.status === 'carrier_assigned' && pickup !== null && pickup >= 0 && pickup <= 48) {
      alerts.push({
        orderId: o.id, orderNumber: orderDisplayNumber(o), shipperName: o.shipperName,
        severity: pickup <= 24 ? 'critical' : 'warning',
        message: `Carrier not signed — pickup in ${Math.round(pickup)}h`,
      });
      continue;
    }

    // Awaiting shipper signature — warn at 48h, critical at 24h
    if (o.status === 'carrier_signed' && pickup !== null && pickup >= 0 && pickup <= 48) {
      alerts.push({
        orderId: o.id, orderNumber: orderDisplayNumber(o), shipperName: o.shipperName,
        severity: pickup <= 24 ? 'critical' : 'warning',
        message: `Awaiting shipper signature — pickup in ${Math.round(pickup)}h`,
      });
      continue;
    }

    // In transit past expected delivery date
    if (o.status === 'in_transit' && delivery !== null && delivery < 0) {
      const hoursLate = Math.abs(delivery);
      const label = hoursLate >= 48
        ? `${Math.round(hoursLate / 24)}d overdue`
        : `${Math.round(hoursLate)}h overdue`;
      alerts.push({
        orderId: o.id, orderNumber: orderDisplayNumber(o), shipperName: o.shipperName,
        severity: 'critical',
        message: `Past expected delivery — ${label}`,
      });
      continue;
    }

    // Delivered but invoice not uploaded after 24h
    if (o.status === 'delivered' && !o.invoiceStoragePath) {
      const deliveredHrs = hoursFromNow(o.deliveredAt as { toDate: () => Date } | null);
      if (deliveredHrs !== null && deliveredHrs <= -24) {
        const daysAgo = Math.round(Math.abs(deliveredHrs) / 24);
        alerts.push({
          orderId: o.id, orderNumber: orderDisplayNumber(o), shipperName: o.shipperName,
          severity: 'warning',
          message: `Delivered ${daysAgo}d ago — invoice not uploaded`,
        });
      }
      continue;
    }

    // Stale quote — no action taken in 7+ days
    if (o.status === 'quote') {
      const createdHrs = hoursFromNow(o.createdAt as { toDate: () => Date });
      if (createdHrs !== null && createdHrs <= -(7 * 24)) {
        const daysOld = Math.round(Math.abs(createdHrs) / 24);
        alerts.push({
          orderId: o.id, orderNumber: orderDisplayNumber(o), shipperName: o.shipperName,
          severity: 'warning',
          message: `Quote stale for ${daysOld}d — no action taken`,
        });
      }
    }
  }

  // Critical first
  alerts.sort((a, b) => (a.severity === 'critical' ? -1 : 1) - (b.severity === 'critical' ? -1 : 1));

  return alerts;
}
