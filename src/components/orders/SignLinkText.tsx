'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, MessageCircle, MessageSquare } from 'lucide-react';
import PhoneField from '@/components/PhoneField';
import { copyToClipboard } from '@/lib/clipboard';
import { DEFAULT_RECORD_REGION } from '@/lib/phone';
import type { PhoneRegion } from '@/lib/phone';
import { signTextMessage, smsHref, whatsappHref, type TextTarget } from '@/lib/signText';

const OTHER = '__other';

/**
 * Text a signing link from RingCentral or WhatsApp — see src/lib/signText.ts
 * for why TTMS opens the app rather than sending anything itself.
 *
 * Both app buttons also copy the message first. RingCentral is not always the
 * computer's default for text links, and some versions open a blank message,
 * so the broker can always paste what they were about to send.
 *
 * The message is editable: it is the broker's own text from their own number,
 * and they know when "Hello" should be "Hola".
 */
export default function SignLinkText({ party, orderNumber, url, expiresAt, targets }: {
  party: 'client' | 'carrier';
  orderNumber?: string;
  url: string;
  expiresAt: string | null;
  targets: TextTarget[];
}) {
  const [pick, setPick] = useState(targets.length ? '0' : OTHER);
  const [otherPhone, setOtherPhone] = useState('');
  const [otherRegion, setOtherRegion] = useState<PhoneRegion>(DEFAULT_RECORD_REGION);
  const fromFile = pick !== OTHER;
  const draft = useMemo(
    () => signTextMessage({ party, orderNumber, url, expiresAt, fromFile }),
    [party, orderNumber, url, expiresAt, fromFile],
  );
  // Null until edited, so switching between a number on file and a typed one
  // still swaps the "type this phone number" line in the default wording.
  const [edited, setEdited] = useState<string | null>(null);
  const message = edited ?? draft;
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');

  const target = fromFile ? targets[Number(pick)] : { phone: otherPhone, region: otherRegion };
  const hasNumber = Boolean(target && target.phone.replace(/\D/g, '').length >= 7);

  async function copyMessage() {
    const ok = await copyToClipboard(message);
    setCopied(ok ? 'copied' : 'failed');
    if (ok) window.setTimeout(() => setCopied('idle'), 2000);
  }

  function open(href: string, newTab: boolean) {
    void copyMessage();
    if (newTab) window.open(href, '_blank', 'noopener');
    else window.location.href = href;
  }

  const button = 'inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50';

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-white p-3" data-learn-skip>
      <label className="block text-xs font-semibold text-gray-700">
        Send to
        <select
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs font-normal text-gray-700"
        >
          {targets.map((t, i) => (
            <option key={i} value={String(i)}>{t.label}: {t.phone}</option>
          ))}
          <option value={OTHER}>Another number…</option>
        </select>
      </label>
      {!fromFile && (
        <div className="mt-2">
          <PhoneField
            label="Number"
            value={otherPhone}
            region={otherRegion}
            onChange={(v, r) => { setOtherPhone(v); setOtherRegion(r); }}
          />
        </div>
      )}
      {targets.length === 0 && (
        <p className="mt-1 text-xs text-gray-500">There is no phone number on the {party}&rsquo;s record, so type one in.</p>
      )}

      <label className="mt-2 block text-xs font-semibold text-gray-700">
        Message
        <textarea
          value={message}
          onChange={(e) => setEdited(e.target.value)}
          rows={7}
          className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs font-normal text-gray-700"
        />
      </label>
      {edited !== null && (
        <button type="button" onClick={() => setEdited(null)} className="mt-1 text-xs text-brand-600 hover:underline">
          Put the original wording back
        </button>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!hasNumber}
          onClick={() => target && open(smsHref(target.phone, target.region, message), false)}
          title="Opens your texting app (RingCentral, if it is set as the default) with the message filled in"
          className={button}
        >
          <MessageSquare className="h-3.5 w-3.5" /> Text (RingCentral)
        </button>
        <button
          type="button"
          disabled={!hasNumber}
          onClick={() => target && open(whatsappHref(target.phone, target.region, message), true)}
          title="Opens a WhatsApp chat with this number, with the message filled in"
          className={button}
        >
          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
        </button>
        <button type="button" onClick={() => void copyMessage()} className={button}>
          {copied === 'copied'
            ? <><Check className="h-3.5 w-3.5 text-green-600" /> Copied</>
            : <><Copy className="h-3.5 w-3.5" /> Copy message</>}
        </button>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        {copied === 'failed'
          ? 'Copying is blocked here. Select the message above and press Ctrl+C.'
          : 'The message is also copied when you press Text or WhatsApp. If the app opens with an empty message, paste it in (Ctrl+V). You press Send in the app; TTMS does not send or record the text.'}
      </p>
    </div>
  );
}
