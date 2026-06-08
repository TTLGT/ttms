import { adminDb } from '@/lib/firebase-admin';
import SignForm from './SignForm';

type Props = { params: Promise<{ token: string }> };

function fmt(ts: { toDate?: () => Date } | null | undefined) {
  if (!ts?.toDate) return '—';
  return ts.toDate().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function fmtCurrency(n: number) {
  if (!n) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 text-center">
          <p className="text-xs font-bold tracking-widest text-brand-600 uppercase mb-1">Total Transport Logistics</p>
          <h1 className="text-2xl font-bold text-gray-900">Carrier Rate Confirmation</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

export default async function SignPage({ params }: Props) {
  const { token } = await params;

  const snap = await adminDb.collection('signing_tokens').doc(token).get();

  if (!snap.exists) {
    return (
      <Shell>
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-4xl mb-4">🔗</p>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Link Not Found</h2>
          <p className="text-sm text-gray-500">This signing link is invalid or has already expired. Please contact your dispatcher for a new link.</p>
        </div>
      </Shell>
    );
  }

  const data = snap.data()!;

  if (data.usedAt) {
    const signedDate = data.usedAt.toDate().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
    return (
      <Shell>
        <div className="bg-white rounded-xl border border-green-200 p-10 text-center">
          <p className="text-4xl mb-4">✅</p>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Already Signed</h2>
          <p className="text-sm text-gray-600">
            This rate confirmation was signed by <strong>{data.signerName}</strong> on {signedDate}.
          </p>
          <p className="text-xs text-gray-400 mt-3">Order {data.orderNumber}</p>
        </div>
      </Shell>
    );
  }

  if (data.expiresAt.toDate() < new Date()) {
    return (
      <Shell>
        <div className="bg-white rounded-xl border border-red-200 p-10 text-center">
          <p className="text-4xl mb-4">⏰</p>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Link Expired</h2>
          <p className="text-sm text-gray-500">This signing link expired on {fmt(data.expiresAt)}. Please contact your dispatcher for a new link.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <SignForm
        token={token}
        orderNumber={data.orderNumber}
        carrierName={data.carrierName}
        driverName={data.driverName || ''}
        commodity={data.commodity}
        weight={data.weight ? `${Number(data.weight).toLocaleString()} lbs` : '—'}
        pieces={data.pieces ? String(data.pieces) : '—'}
        originStr={data.originStr}
        destinationStr={data.destinationStr}
        pickupDate={fmt(data.pickupDate)}
        deliveryDate={fmt(data.deliveryDate)}
        carrierPay={fmtCurrency(data.carrierPay)}
        notes={data.notes || ''}
      />
    </Shell>
  );
}
