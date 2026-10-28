'use client';

import { useEffect, useState } from 'react';
import { BadgeCheck, Building2, Link2, Loader2, Plus, Search, Truck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import QuickAddCarrierModal from '@/components/carriers/QuickAddCarrierModal';
import { announceOrderEvent, updateOrder } from '@/lib/orders';
import { lookupSignedCopyCarrier } from '@/lib/orderPaperwork';
import { carrierNameKey, type Carrier } from '@/types/carrier';
import type { OrderFile } from '@/types/orderFile';
import type { CarrierLookup } from '@/types/signedDocument';

/**
 * The first step of verifying a carrier's signed agreement: the load needs
 * its carrier. A BATS load arrives with none — the import linked no carriers —
 * and the signature being recorded is that carrier's, so verifying waits on it
 * (enforced in /files/{id}/signature, not only here).
 *
 * What the dispatch sheet names is read off it (src/lib/signatureReader.ts):
 * the company, its contact and phone, the driver and their phone. From that:
 *
 * - **Already in TTMS** — the carriers that match it, by MC or DOT if the
 *   sheet printed one, else by name. One click links it, with the sheet's
 *   driver if the load has none yet.
 * - **On FMCSA** — when nothing here matches, the companies FMCSA lists under
 *   that name. Picking one opens Add Carrier with that DOT already looked up,
 *   so its authority and insurance are checked on the way in — and if it turns
 *   out to be in TTMS under another name, that window says so and offers it.
 * - **Add as a new carrier** — the same window, filled from the sheet.
 *
 * Linking is the ordinary order save (`updateOrder`), which writes the change
 * log and is open to anybody who can edit the load.
 */
export default function SignedCopyCarrierStep({
  orderId, file, carrier, driverName, onLinked,
}: {
  orderId: string;
  file: OrderFile;
  /** The carrier on the load now. */
  carrier: { id: string | null; name: string };
  /** The load's driver now — the sheet's is used only when there is none. */
  driverName: string;
  onLinked: (carrier: { id: string; name: string }) => void;
}) {
  const { can } = useAuth();
  const read = file.detected?.carrier ?? null;
  const [lookup, setLookup] = useState<CarrierLookup | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [adding, setAdding] = useState<null | { lookup?: { kind: 'dot' | 'mc'; number: string } }>(null);
  const mayLook = can('carriers.view');

  useEffect(() => {
    if (carrier.id || !read || !mayLook) return;
    let live = true;
    lookupSignedCopyCarrier(orderId, file.id)
      .then((r) => { if (live) setLookup(r); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : 'Could not look the carrier up'); });
    return () => { live = false; };
  }, [carrier.id, read, mayLook, orderId, file.id]);

  async function link(id: string, name: string) {
    setBusy(id);
    setError('');
    try {
      await updateOrder(orderId, {
        carrierId: id,
        carrierName: name,
        // The sheet's driver, only onto a load that has none: a driver typed
        // on the load is the newer word.
        ...(!driverName.trim() && read?.driverName
          ? { driverId: null, driverName: read.driverName, driverPhone: read.driverPhone ?? '' }
          : {}),
      });
      void announceOrderEvent(orderId, 'carrier');
      onLinked({ id, name });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not link the carrier');
    } finally {
      setBusy('');
    }
  }

  // ── Linked already ────────────────────────────────────────────────────────
  if (carrier.id) {
    const differs = read?.name && carrierNameKey(read.name) !== carrierNameKey(carrier.name);
    return (
      <div className={`rounded-lg border px-3 py-2.5 text-xs ${differs ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-green-200 bg-green-50 text-green-800'}`}>
        <p className="flex items-center gap-1.5 font-semibold">
          <BadgeCheck className="h-4 w-4" /> Carrier on this load: {carrier.name || 'linked'}
        </p>
        {differs && (
          <p className="mt-1">
            The dispatch sheet names <strong>{read!.name}</strong>. Check it is the same company before verifying.
          </p>
        )}
      </div>
    );
  }

  // ── Not linked yet ────────────────────────────────────────────────────────
  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
          <Truck className="h-4 w-4" /> Step 1 — link the carrier
        </p>
        <p className="mt-0.5 text-xs text-amber-800">
          This load has no carrier yet. The agreement can be verified once the carrier who signed it is on the load.
        </p>
      </div>

      {read ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-md border border-amber-200 bg-white px-3 py-2 text-xs">
          <dt className="text-gray-400">Carrier</dt><dd className="font-semibold text-gray-900">{read.name ?? '—'}</dd>
          {read.contact && (<><dt className="text-gray-400">Contact</dt><dd className="text-gray-700">{read.contact}</dd></>)}
          {read.phone && (<><dt className="text-gray-400">Phone</dt><dd className="text-gray-700">{read.phone}</dd></>)}
          {(read.mc || read.dot) && (<><dt className="text-gray-400">Numbers</dt><dd className="font-mono text-gray-700">{[read.mc && `MC ${read.mc}`, read.dot && `DOT ${read.dot}`].filter(Boolean).join(' · ')}</dd></>)}
          {read.driverName && (<><dt className="text-gray-400">Driver</dt><dd className="text-gray-700">{read.driverName}{read.driverPhone ? ` · ${read.driverPhone}` : ''}</dd></>)}
          <dd className="col-span-2 mt-1 text-[10px] uppercase tracking-wide text-emerald-700">Read from the dispatch sheet</dd>
        </dl>
      ) : (
        <p className="text-xs text-amber-800">
          No carrier could be read off this file. Assign the carrier in the Carrier section of the load, then verify.
        </p>
      )}

      {!mayLook && read && (
        <p className="text-xs text-amber-800">Ask dispatch to link the carrier — you cannot look carriers up.</p>
      )}

      {mayLook && read && !lookup && !error && (
        <p className="flex items-center gap-1.5 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking for them in TTMS…</p>
      )}

      {lookup && lookup.matches.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Already in TTMS</p>
          {lookup.matches.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-1.5">
              <Building2 className="h-4 w-4 flex-none text-gray-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {c.companyName}{!c.isActive && <span className="ml-1 text-xs font-normal text-gray-400">(inactive)</span>}
                </p>
                <p className="truncate font-mono text-[11px] text-gray-500">
                  {[c.mc && `MC ${c.mc}`, c.dot && `DOT ${c.dot}`, c.phone].filter(Boolean).join(' · ') || 'No numbers on file'}
                </p>
              </div>
              <button type="button" onClick={() => void link(c.id, c.companyName)} disabled={Boolean(busy)}
                className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                {busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />} Link
              </button>
            </div>
          ))}
        </div>
      )}

      {lookup && lookup.matches.length === 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Not in TTMS yet — found on FMCSA</p>
          {lookup.fmcsaError ? (
            <p className="text-xs text-gray-600">{lookup.fmcsaError}</p>
          ) : lookup.fmcsa.length === 0 ? (
            <p className="text-xs text-gray-600">FMCSA lists nobody under that name. Add the carrier with their MC or DOT.</p>
          ) : lookup.fmcsa.map((m) => (
            <div key={m.dotNumber} className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-1.5">
              <Search className="h-4 w-4 flex-none text-gray-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {m.legalName}{m.dbaName && <span className="ml-1 text-xs font-normal text-gray-500">DBA {m.dbaName}</span>}
                </p>
                <p className="truncate text-[11px] text-gray-500">
                  <span className="font-mono">DOT {m.dotNumber}</span>
                  {(m.city || m.state) && <> · {[m.city, m.state].filter(Boolean).join(', ')}</>}
                  {m.allowedToOperate === 'N' && <span className="ml-1 font-semibold text-red-600">· not allowed to operate</span>}
                </p>
              </div>
              <button type="button" onClick={() => setAdding({ lookup: { kind: 'dot', number: m.dotNumber } })}
                className="inline-flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100">
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
          ))}
        </div>
      )}

      {mayLook && read && (
        <button type="button"
          onClick={() => setAdding(read.dot ? { lookup: { kind: 'dot', number: read.dot } } : read.mc ? { lookup: { kind: 'mc', number: read.mc } } : {})}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
          <Plus className="h-3.5 w-3.5" /> Add as a new carrier
        </button>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {adding && (
        <QuickAddCarrierModal
          prefill={{
            companyName: read?.name ?? '',
            // BATS prints the job before the name: "Dispatcher Katy".
            contactName: (read?.contact ?? '').replace(/^dispatcher\s+/i, ''),
            phone: read?.phone ?? '',
            lookup: adding.lookup,
          }}
          onCancel={() => setAdding(null)}
          onCreated={(c: Carrier) => { setAdding(null); void link(c.id, c.companyName); }}
        />
      )}
    </div>
  );
}
