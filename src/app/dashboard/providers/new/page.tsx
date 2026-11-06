'use client';

import { useRouter } from 'next/navigation';
import ProviderForm, { blankProvider } from '@/components/providers/ProviderForm';
import { Bi } from '@/components/spanish/Es';

/** Add a 3rd-party provider to the directory. */
export default function NewProviderPage() {
  const router = useRouter();
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
      <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700 mb-2">← Back</button>
      <h1 className="text-2xl font-bold text-gray-900 mb-1"><Bi>Add a 3rd party provider</Bi></h1>
      <p className="text-sm text-gray-500 mb-6">
        <Bi>A name, what they do and a phone or email is enough to start. Everybody in the company will be able to find them.</Bi>
      </p>
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <ProviderForm initial={blankProvider()} onSaved={(p) => router.push(`/dashboard/providers/${p.id}`)}
          onCancel={() => router.back()} />
      </section>
    </div>
  );
}
