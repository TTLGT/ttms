'use client';

import { useEffect, useState } from 'react';
import { Loader2, Mail, PhoneCall, StickyNote, Target } from 'lucide-react';
import OrderSection from '@/components/orders/OrderSection';
import DateField from '@/components/DateField';
import { Bi, Es } from '@/components/spanish/Es';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { actOnClient, fetchClientSales, type ClientSalesAction } from '@/lib/clientSales';
import {
  ACCOUNT_NEXT_STEP, ACTIVITY_LABEL, BOARD_COLUMNS, BOARD_COLUMN_HINT, BOARD_COLUMN_LABEL, MAX_NEXT_STEP,
  isLeadStage, leadColumn, type ActivityKind, type ClientSalesView,
} from '@/types/clientSales';
import { CLIENT_TYPE_LABEL, CLIENT_TYPE_MEANING, type ClientSnapshot } from '@/types/clientSnapshot';

const INPUT = 'border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400';

/**
 * The sales side of one client — see src/types/clientSales.ts. Draws nothing
 * for somebody who may open the client but not its sales history; the server
 * sends them `visible: false` and no more.
 *
 * The strip at the top changes with the client: the lead pipeline until its
 * first load (moved by the broker, or by itself once a load exists), then the
 * client type TTMS works out from its loads (nobody moves it). The buttons and
 * the history stay the same either way.
 */
export default function ClientSalesCard({ partyId, snapshot }: { partyId: string; snapshot: ClientSnapshot | null }) {
  const [view, setView] = useState<ClientSalesView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [logging, setLogging] = useState<ActivityKind | null>(null);
  const [text, setText] = useState('');
  const [losing, setLosing] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const { formatDateTime } = useDateFormatters();

  useEffect(() => {
    let live = true;
    fetchClientSales(partyId).then((v) => { if (live) setView(v); }).catch(() => {});
    return () => { live = false; };
  }, [partyId]);

  if (!view?.visible) return null;
  const sales = view.sales;
  const isLead = !!sales?.isLead;

  async function run(act: ClientSalesAction): Promise<boolean> {
    setBusy(true); setError('');
    try {
      setView(await actOnClient(partyId, act));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveLog() {
    if (!logging) return;
    if (await run({ action: 'log', kind: logging, text })) { setLogging(null); setText(''); }
  }

  const column = sales ? leadColumn(sales.stage, view) : 'found';

  return (
    <OrderSection id="sales" icon={Target} tone="amber" title="Sales activity"
      sub={<Bi>Only the broker working this client, their Sales Manager and admins see this.</Bi>}>
      {/* ── The strip ─────────────────────────────────────────────── */}
      {view.booked && snapshot ? (
        <AccountStrip snapshot={snapshot} />
      ) : isLead && sales ? (
        <div>
          <div className="flex gap-1" role="group" aria-label="Lead stage">
            {BOARD_COLUMNS.map((c) => {
              const at = BOARD_COLUMNS.indexOf(column);
              const i = BOARD_COLUMNS.indexOf(c);
              const tone = i === at ? 'bg-brand-600 text-white' : i < at ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-500';
              const settable = isLeadStage(c) && !sales.lost;
              return (
                <button key={c} type="button" disabled={!settable || busy || c === sales.stage}
                  title={BOARD_COLUMN_HINT[c]} data-es={BOARD_COLUMN_LABEL[c]}
                  onClick={() => isLeadStage(c) && void run({ action: 'stage', stage: c })}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-bold uppercase tracking-wide ${tone} disabled:cursor-default`}>
                  {BOARD_COLUMN_LABEL[c]}
                </button>
              );
            })}
          </div>
          {sales.lost && (
            <p className="mt-2 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">
              <span data-es className="font-semibold">Marked lost</span>{sales.lostReason ? ` · ${sales.lostReason}` : ''}
              <button type="button" onClick={() => void run({ action: 'reopen' })} disabled={busy} data-es
                className="ml-3 text-sm font-semibold text-brand-700 underline">Reopen</button>
            </p>
          )}
          <NextStep key={`${sales.nextStep}|${sales.nextDue}`} nextStep={sales.nextStep} nextDue={sales.nextDue} busy={busy}
            onSave={(nextStep, nextDue) => run({ action: 'next', nextStep, nextDue })} />
        </div>
      ) : !view.booked ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-gray-300 px-4 py-3">
          <p className="text-sm text-gray-600"><Bi>Not being worked as a lead. Track it to put it on your My leads board.</Bi></p>
          <button type="button" onClick={() => void run({ action: 'lead' })} disabled={busy} data-es
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
            Track as a lead
          </button>
        </div>
      ) : null}

      {/* ── Log something ─────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap gap-2">
        {([['call', PhoneCall, 'Log a call'], ['email', Mail, 'Log an email'], ['note', StickyNote, 'Add a note']] as const).map(([kind, Icon, label]) => (
          <button key={kind} type="button" onClick={() => { setLogging(logging === kind ? null : kind); setError(''); }}
            data-es={label}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold ${logging === kind ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
            <Icon className="w-4 h-4" aria-hidden />{label}
          </button>
        ))}
        {isLead && sales && !sales.lost && !view.booked && (
          <button type="button" data-es onClick={() => setLosing((v) => !v)}
            className="ml-auto text-sm text-gray-500 underline">Mark lost</button>
        )}
      </div>
      {losing && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <input value={lostReason} onChange={(e) => setLostReason(e.target.value)} maxLength={MAX_NEXT_STEP} autoFocus
            placeholder="Why (optional): went with another broker, no freight for us" className={`${INPUT} flex-1 min-w-[16rem]`} />
          <button type="button" disabled={busy} data-es
            onClick={() => void run({ action: 'lost', reason: lostReason.trim() }).then((ok) => { if (ok) { setLosing(false); setLostReason(''); } })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
            Mark lost
          </button>
        </div>
      )}
      {logging && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} autoFocus
            placeholder={logging === 'note' ? 'The note' : 'Who you spoke to and what was said (optional)'}
            className={`${INPUT} flex-1 min-w-[16rem] resize-y`} />
          <button type="button" onClick={() => void saveLog()} disabled={busy || (logging === 'note' && !text.trim())}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}<span data-es>Save</span>
          </button>
        </div>
      )}
      {logging && logging !== 'note' && (
        <p className="mt-1 text-xs text-gray-500"><Bi>Also counts as one on your today’s targets.</Bi></p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {/* ── History ───────────────────────────────────────────────── */}
      <p data-es className="mt-5 text-xs font-bold uppercase tracking-wide text-gray-500">Activity</p>
      {view.activity.length === 0 ? (
        <p className="mt-1 text-sm text-gray-400"><Bi>Nothing logged yet.</Bi></p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100">
          {view.activity.map((a) => (
            <li key={a.id} className="flex gap-3 py-2 text-sm">
              <span className="w-36 flex-shrink-0 text-xs text-gray-500 tabular-nums pt-0.5">{formatDateTime(a.at)}</span>
              <span className="min-w-0">
                <span data-es className="font-semibold text-gray-900">{ACTIVITY_LABEL[a.kind] ?? a.kind}</span>
                {a.kind === 'stage' && a.stage && <> → <span data-es>{BOARD_COLUMN_LABEL[a.stage]}</span></>}
                {a.text && <span className="text-gray-700 whitespace-pre-line"> · {a.text}</span>}
                <span className="block text-xs text-gray-400">{a.byName}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </OrderSection>
  );
}

/** The next step and when, for a lead. Saved with its own button. */
function NextStep({ nextStep, nextDue, busy, onSave }: {
  nextStep: string; nextDue: string | null; busy: boolean;
  onSave: (nextStep: string, nextDue: string | null) => Promise<boolean>;
}) {
  const [step, setStep] = useState(nextStep);
  const [due, setDue] = useState(nextDue ?? '');
  const dirty = step !== nextStep || (due || null) !== nextDue;
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <label className="flex-1 min-w-[14rem] text-sm">
        <span data-es className="block text-xs text-gray-500 mb-1">Next step</span>
        <input value={step} onChange={(e) => setStep(e.target.value)} maxLength={MAX_NEXT_STEP}
          placeholder="Send flatbed rates" className={`${INPUT} w-full`} />
      </label>
      <label className="text-sm">
        <span data-es className="block text-xs text-gray-500 mb-1">By</span>
        <DateField value={due} onChange={setDue} ariaLabel="Next step due" />
      </label>
      <button type="button" disabled={!dirty || busy} onClick={() => void onSave(step.trim(), due || null)}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
        <span data-es>Save</span>
      </button>
      <p className="basis-full text-xs text-gray-500"><Bi>A next step due today shows up in your morning planning pop-up.</Bi></p>
    </div>
  );
}

/**
 * After the first load: the client type TTMS works out (clientSnapshot.ts),
 * as a strip, with the suggested way to keep the account. Occasional and
 * Dormant are a warning rather than a step, because they are not on the way
 * anywhere.
 */
function AccountStrip({ snapshot }: { snapshot: ClientSnapshot }) {
  const path = ['new', 'potential', 'recurrent'] as const;
  const at = (path as readonly string[]).indexOf(snapshot.type);
  const quiet = snapshot.type === 'occasional' || snapshot.type === 'dormant';
  return (
    <div>
      <div className="flex gap-1" aria-label="Client type">
        {path.map((t, i) => (
          <span key={t} data-es title={CLIENT_TYPE_MEANING[t]}
            className={`flex-1 rounded-md px-2 py-1.5 text-center text-xs font-bold uppercase tracking-wide ${
              i === at ? (t === 'recurrent' ? 'bg-green-600 text-white' : 'bg-brand-600 text-white')
                : i < at || quiet ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>
            {CLIENT_TYPE_LABEL[t]}
          </span>
        ))}
      </div>
      {quiet && (
        <p className="mt-2 text-sm font-semibold text-red-700">
          {CLIENT_TYPE_LABEL[snapshot.type]} · {CLIENT_TYPE_MEANING[snapshot.type]}
          <Es>{CLIENT_TYPE_MEANING[snapshot.type]}</Es>
        </p>
      )}
      {ACCOUNT_NEXT_STEP[snapshot.type] && (
        <p className="mt-2 text-sm font-semibold text-brand-700">
          <span data-es>Next</span>: <span data-es>{ACCOUNT_NEXT_STEP[snapshot.type]}</span>
        </p>
      )}
      <p className="mt-1 text-xs text-gray-500"><Bi>Worked out by TTMS from this client’s loads. Nobody moves it.</Bi></p>
    </div>
  );
}
