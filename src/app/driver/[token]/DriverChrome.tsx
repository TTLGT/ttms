'use client';

import { useEffect, useState } from 'react';
import { Languages } from 'lucide-react';
import { LANG_KEY, STRINGS, type Lang, type Strings } from './strings';

/**
 * The driver's language, English unless they switched. Read after the first
 * render so the server's English and the browser's first frame agree; kept
 * per phone, and wrapped because storage can be refused in a private tab.
 */
export function useDriverLang(): [Lang, Strings, (l: Lang) => void] {
  const [lang, setLang] = useState<Lang>('en');
  useEffect(() => {
    try {
      if (localStorage.getItem(LANG_KEY) === 'es') setLang('es');
    } catch { /* stays English */ }
  }, []);
  function choose(next: Lang) {
    setLang(next);
    try { localStorage.setItem(LANG_KEY, next); } catch { /* this visit only */ }
  }
  return [lang, STRINGS[lang], choose];
}

export function DriverHeader({ t, lang, setLang, orderNumber }: {
  t: Strings; lang: Lang; setLang: (l: Lang) => void; orderNumber: string;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">{t.brand}</p>
        <h1 className="text-xl font-bold text-gray-900">{t.title}</h1>
        {orderNumber && <p className="text-sm text-gray-500">{t.load} {orderNumber}</p>}
      </div>
      <button
        type="button"
        onClick={() => setLang(lang === 'en' ? 'es' : 'en')}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700"
      >
        <Languages className="h-4 w-4" /> {t.switchLang}
      </button>
    </div>
  );
}
