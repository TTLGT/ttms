import { cookies } from 'next/headers';
import { adminDb } from '@/lib/firebase-admin';
import { hasSignAccess, isVerifyLocked } from '@/lib/signAccess';
import { DRIVER_PAGE_COOKIE, DRIVER_TOKEN_RE, driverLinkRef, linkProblem, type LinkProblem } from '@/lib/driverLinksServer';
import { addressToQuery, orderDeliveries, orderDisplayNumber, orderPickups, type Order, type OrderStop } from '@/types/order';
import { codAmount, isCodLoad } from '@/types/orderPayment';
import { usd } from '@/types/paymentMethod';
import { STRINGS } from './strings';
import DriverVerify from './DriverVerify';
import DriverPanel, { type DriverPageData, type DriverStopView } from './DriverPanel';

type Props = { params: Promise<{ token: string }> };

// Every visit reads the load as it is now; nothing here may be cached.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Driver updates — Total Transport Logistics',
  // A link meant for one driver should never turn up in a search engine.
  robots: { index: false, follow: false },
};

function Problem({ kind }: { kind: LinkProblem }) {
  // Both languages at once: the toggle lives in the page proper, and a dead
  // link is the one screen a driver should not have to work out.
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-md rounded-xl border border-gray-200 bg-white p-6 text-center">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-brand-600">Total Transport Logistics</p>
        <p className="mt-4 text-sm text-gray-800">{STRINGS.en.problem[kind]}</p>
        <p className="mt-2 text-sm text-gray-500">{STRINGS.es.problem[kind]}</p>
      </div>
    </div>
  );
}

function millisOf(v: unknown): number | null {
  const t = v as { toMillis?: () => number } | null | undefined;
  return typeof t?.toMillis === 'function' ? t.toMillis() : null;
}

/** A stop as the driver needs it: who, where, when, and a map. No rates, no contacts beyond the stop. */
function stopView(s: OrderStop): DriverStopView {
  const a = s.address ?? { street: '', city: '', state: '', zip: '', country: '' };
  const place = [a.city, [a.state, a.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const query = addressToQuery(a);
  return {
    name: s.partyName ?? '',
    lines: [String(a.street ?? '').trim(), place].filter(Boolean),
    date: millisOf(s.date),
    dateEnd: millisOf(s.dateEnd),
    mapUrl: query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : '',
  };
}

/**
 * The driver's page — PUBLIC, like /sign/[token]. What it shows is the trip
 * and nothing about the money except, on a COD load, what to collect: no
 * rate, no client name, no broker fee. See src/types/driverLink.ts.
 */
export default async function DriverPage({ params }: Props) {
  const { token } = await params;
  if (!DRIVER_TOKEN_RE.test(token)) return <Problem kind="missing" />;

  const link  = (await driverLinkRef(token).get()).data();
  const order = link ? (await adminDb.collection('orders').doc(String(link.orderId)).get()).data() : undefined;
  const problem = linkProblem(link, order);
  if (problem) return <Problem kind={problem} />;

  const number = orderDisplayNumber(order as Partial<Order>) || String(link!.orderNumber ?? '');
  if (!hasSignAccess(link!, (await cookies()).get(DRIVER_PAGE_COOKIE)?.value)) {
    return <DriverVerify token={token} orderNumber={number} locked={isVerifyLocked(link!)} />;
  }

  const o = order as Order;
  const cod = isCodLoad(o);
  const amount = codAmount(o);
  const marks = o.paymentMarks ?? {};
  const freight = [
    o.commodity,
    o.pieces ? `${o.pieces} pcs` : '',
    o.weight ? `${o.weight.toLocaleString('en-US')} lb` : '',
  ].filter(Boolean).join(' · ');

  const data: DriverPageData = {
    token,
    orderNumber: number,
    driverName: String(link!.driverName ?? ''),
    pickups: orderPickups(o).map(stopView),
    deliveries: orderDeliveries(o).map(stopView),
    freight,
    progress: o.driverProgress ?? {},
    cod,
    codAmount: amount ? usd(amount) : null,
    // Only the marks that are the driver's to see, and only when.
    paidAt: {
      driverPaid: marks.driverPaid?.at ?? null,
      clientPaid: cod ? marks.clientPaid?.at ?? null : null,
    },
    delivered: Boolean(o.driverProgress?.delivered) || ['delivered', 'completed'].includes(o.status),
  };
  return <DriverPanel data={data} />;
}
