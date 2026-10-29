'use client';

import { useState } from 'react';
import { DriverHeader, useDriverLang } from './DriverChrome';
import { errorText } from './strings';

/**
 * The one question before the driver page: the phone number on the load.
 * A right answer sets this link's cookie and the page loads again. Like the
 * signing link's VerifyForm, it never hints at what number is on file.
 */
export default function DriverVerify({ token, orderNumber, locked }: { token: string; orderNumber: string; locked: boolean }) {
  const [lang, t, setLang] = useDriverLang();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>(locked ? 'locked' : '');
  const [left, setLeft]   = useState<number | null>(null);
  const [blocked, setBlocked] = useState(locked);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || busy || blocked) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/driver/${token}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(typeof body.error === 'string' ? body.error : 'failed');
      setLeft(typeof body.left === 'number' ? body.left : null);
      if (res.status === 429 || res.status === 410 || res.status === 404) setBlocked(true);
    } catch {
      setError('network');
    }
    setBusy(false);
  }

  // Worded at render time, so switching language rewords an error already shown.
  const message = error === 'wrong' && left !== null ? t.wrong(left)
    : error === 'network' ? t.network
    : error ? errorText(t, error) : '';

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-md">
        <DriverHeader t={t} lang={lang} setLang={setLang} orderNumber={orderNumber} />
        <form onSubmit={submit} className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-2 text-lg font-semibold text-gray-800">{t.verifyTitle}</h2>
          <p className="mb-5 text-sm text-gray-600">{t.verifyBody}</p>
          <label htmlFor="driver-phone" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t.phone}
          </label>
          <input
            id="driver-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={blocked}
            placeholder="(555) 123-4567"
            className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-100"
          />
          {message && <p className="mt-3 text-sm text-red-600">{message}</p>}
          <button
            type="submit"
            disabled={busy || blocked || !value.trim()}
            className="mt-5 w-full rounded-lg bg-brand-600 px-5 py-3 text-base font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? t.checking : t.continue}
          </button>
        </form>
      </div>
    </div>
  );
}
