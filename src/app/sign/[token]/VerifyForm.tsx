'use client';

import { useState } from 'react';

/**
 * What a signing link shows before the agreement: one box for an email or
 * phone we hold for the signer. A right answer sets this link's cookie
 * (POST /api/sign/[token]/verify) and the page is loaded again, now showing
 * the agreement. See src/lib/signAccess.ts.
 *
 * It says nothing about what is on file — no masked address, no hint. The
 * address the email arrived at always works, and the copy says so.
 */
export default function VerifyForm({ token, isClient, locked }: { token: string; isClient: boolean; locked: boolean }) {
  const [value, setValue]     = useState('');
  const [error, setError]     = useState(locked ? 'Too many tries. Please ask your dispatcher to send the agreement again, and use the new email.' : '');
  const [blocked, setBlocked] = useState(locked);
  const [busy, setBusy]       = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || busy || blocked) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/sign/${token}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(typeof body.error === 'string' ? body.error : 'Something went wrong. Please try again.');
      if (res.status === 429 || res.status === 410 || res.status === 404) setBlocked(true);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 p-6 sm:p-10">
      <h2 className="text-lg font-semibold text-gray-800 mb-2">Confirm it is you</h2>
      <p className="text-sm text-gray-600 mb-5">
        To open this {isClient ? 'load confirmation' : 'dispatch sheet'}, type the email address or phone number
        we have on file for you. The email address this link was sent to works.
      </p>
      <label htmlFor="verify-value" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
        Email or phone number
      </label>
      <input
        id="verify-value"
        type="text"
        inputMode="email"
        autoComplete="email"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={blocked}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-100"
        placeholder="name@company.com or (555) 123-4567"
      />
      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      <button
        type="submit"
        disabled={busy || blocked || !value.trim()}
        className="mt-5 w-full px-5 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition disabled:opacity-50"
      >
        {busy ? 'Checking…' : 'Continue'}
      </button>
    </form>
  );
}
