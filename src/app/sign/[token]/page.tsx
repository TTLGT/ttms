import { adminDb } from '@/lib/firebase-admin';
import { longDate as fmt, signFormData } from '@/lib/signFormProps';
import SignForm, { SignedCopyLink } from './SignForm';

type Props = { params: Promise<{ token: string }> };

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 text-center">
          <p className="text-xs font-bold tracking-widest text-brand-600 uppercase mb-1">Total Transport Logistics</p>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

export default async function SignPage({ params }: Props) {
  const { token } = await params;

  const snap = await adminDb.collection('signing_tokens').doc(token).get();

  // `shipper_agreement` is the client's load confirmation — the token type is
  // historical and names the field it writes, not who signs it.
  const isClient  = snap.exists && snap.data()!.type === 'shipper_agreement';
  const pageTitle = isClient ? 'Client Load Confirmation' : 'Carrier Rate Confirmation';

  if (!snap.exists) {
    return (
      <Shell title={pageTitle}>
        <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-10 text-center">
          <p className="text-4xl mb-4">🔗</p>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Link Not Found</h2>
          <p className="text-sm text-gray-500">This signing link is invalid or has already expired. Please contact your dispatcher for a new link.</p>
        </div>
      </Shell>
    );
  }

  const data = snap.data()!;

  // Before "already signed": a link that was signed and has since been put
  // on hold or cancelled must say so, or the client is told a stale signature
  // still stands. See src/lib/clientAgreements.ts.
  if (data.revokedAt) {
    return (
      <Shell title={pageTitle}>
        <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-10 text-center">
          <p className="text-4xl mb-4">🔗</p>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Link No Longer Valid</h2>
          <p className="text-sm text-gray-500">This agreement has been withdrawn. Please contact your dispatcher if you have questions.</p>
          <p className="text-xs text-gray-400 mt-3">Order {data.orderNumber}</p>
        </div>
      </Shell>
    );
  }

  if (data.heldAt) {
    return (
      <Shell title={pageTitle}>
        <div className="bg-white rounded-xl border border-amber-200 p-6 sm:p-10 text-center">
          <p className="text-4xl mb-4">📝</p>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">This Agreement Is Being Updated</h2>
          <p className="text-sm text-gray-600">
            Something about this load changed after we sent you the agreement. We are reviewing the change and will
            email you the updated version shortly.
          </p>
          <p className="text-sm text-gray-600 mt-2">
            This same link and QR code will show it, so there is no need to look for a new one.
          </p>
          {/* Signed before the change: the version they signed is still theirs. */}
          {isClient && data.usedAt && (
            <div className="mt-4"><SignedCopyLink token={token} label="Download the version you signed (PDF)" /></div>
          )}
          <p className="text-xs text-gray-400 mt-3">Order {data.orderNumber}</p>
        </div>
      </Shell>
    );
  }

  if (data.usedAt) {
    const signedDate = data.usedAt.toDate().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
    return (
      <Shell title={pageTitle}>
        <div className="bg-white rounded-xl border border-green-200 p-6 sm:p-10 text-center">
          <p className="text-4xl mb-4">✅</p>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">{isClient ? 'Signed' : 'Already Signed'}</h2>
          <p className="text-sm text-gray-600">
            This confirmation was signed by <strong>{data.signerName}</strong> on {signedDate}.
          </p>
          {/* Every time the client comes back to the link, their signed copy is here. */}
          {isClient && (
            <div className="mt-5">
              <SignedCopyLink token={token} />
            </div>
          )}
          <p className="text-xs text-gray-400 mt-3">Order {data.orderNumber}</p>
        </div>
      </Shell>
    );
  }

  if (data.expiresAt.toDate() < new Date()) {
    return (
      <Shell title={pageTitle}>
        <div className="bg-white rounded-xl border border-red-200 p-6 sm:p-10 text-center">
          <p className="text-4xl mb-4">⏰</p>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Link Expired</h2>
          <p className="text-sm text-gray-500">This signing link expired on {fmt(data.expiresAt)}. Please contact your dispatcher for a new link.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title={pageTitle}>
      <SignForm token={token} {...signFormData(data)} />
    </Shell>
  );
}
