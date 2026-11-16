'use client';

import { useState } from 'react';
import { AlertTriangle, Check, Copy, ImagePlus, MessageSquareText } from 'lucide-react';
import { getDriverLink } from '@/lib/driverLinks';
import { copyToClipboard } from '@/lib/clipboard';
import { PICTURE_BOXES, photosInBox, type LoadPhoto, type PictureBox } from '@/types/loadPhoto';
import { Bi } from '@/components/spanish/Es';
import { useLoadPhotos } from './LoadPhotosContext';

/** How many thumbnails a box shows before "+N". */
const SHOWN = 3;

/**
 * One box per kind of picture a load is expected to have, at the top of the
 * Pictures tab (2026-11-16) — see PICTURE_BOXES. A picture dropped into a box,
 * or chosen from its button, is already that type, so it is saved at once
 * with no question (unless the load has several lines or stops and the tray
 * must ask which).
 *
 * Truck turns amber while the Dispatch Sheet review is open and none is on
 * file, in the review's own words, and offers a ready message for the driver.
 */
export default function PictureNeeds({ truckNeeded, onOpen }: {
  /** The carrier review is open and asks for a truck picture. */
  truckNeeded: boolean;
  onOpen: (photo: LoadPhoto) => void;
}) {
  const { photos } = useLoadPhotos();
  return (
    <div className="mb-5">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {PICTURE_BOXES.map((box) => (
          <Box key={box.key} box={box} mine={photosInBox(photos, box)}
            needed={box.key === 'truck' && truckNeeded} onOpen={onOpen} />
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        <Bi>Anything else: drop it anywhere on the page and pick its type.</Bi>
      </p>
    </div>
  );
}

function Box({ box, mine, needed, onOpen }: {
  box: PictureBox; mine: LoadPhoto[]; needed: boolean; onOpen: (p: LoadPhoto) => void;
}) {
  const store = useLoadPhotos();
  const [over, setOver] = useState(false);
  const preset = { stage: box.stage, stop: box.stop };
  const missing = needed && mine.length === 0;

  return (
    <div
      // Claims the drop before the page-wide frame sees it (defaultPrevented).
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setOver(false);
        // Anything that is not a picture is turned away by addFiles, with
        // the pointer to the Documents tab.
        store.addFiles([...e.dataTransfer.files], preset);
      }}
      className={`flex min-w-0 flex-col gap-1.5 rounded-xl border-2 p-3 transition ${
        over ? 'border-brand-500 bg-brand-50'
          : missing ? 'border-dashed border-amber-400 bg-amber-50'
          : mine.length ? 'border-solid border-gray-200 bg-white'
          : 'border-dashed border-gray-300 bg-white'}`}
    >
      {missing && (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5" /> <span data-es>Needed for the Dispatch Sheet review</span>
        </span>
      )}
      <div className="flex items-baseline justify-between gap-2">
        <span data-es className="text-sm font-semibold text-gray-900">{box.label}</span>
        {mine.length > 0 && <span className="text-xs text-gray-400">{mine.length}</span>}
      </div>

      {mine.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {mine.slice(0, SHOWN).map((p) => (
            <button key={p.id} type="button" onClick={() => onOpen(p)} title={p.caption || 'Open picture'}
              className="h-10 w-12 overflow-hidden rounded-md bg-gray-100 hover:ring-2 hover:ring-brand-400">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed link to a private bucket */}
              <img src={p.thumbUrl} alt={p.caption || box.label} className="h-full w-full object-cover" />
            </button>
          ))}
          {mine.length > SHOWN && (
            <button type="button" onClick={() => onOpen(mine[SHOWN])}
              className="flex h-10 w-12 items-center justify-center rounded-md bg-gray-100 text-xs font-medium text-gray-600 hover:bg-gray-200">
              +{mine.length - SHOWN}
            </button>
          )}
        </div>
      ) : (
        <p data-es className="text-[11px] leading-snug text-gray-500">{box.hint}</p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
        <button type="button" onClick={() => store.choose(preset)}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
          <ImagePlus className="h-3.5 w-3.5" /> <span data-es>{mine.length ? 'Add more' : 'Add or drop here'}</span>
        </button>
        {box.key === 'truck' && mine.length === 0 && <AskDriver />}
      </div>
    </div>
  );
}

/**
 * Copies a message for the driver with their link in it — the driver's page
 * already takes Truck pictures. Reads the link only when pressed, and never
 * makes one: that is the Carrier section's job, with its own checks.
 */
function AskDriver() {
  const { order } = useLoadPhotos();
  const [state, setState] = useState<'idle' | 'busy' | 'copied' | 'none' | { manual: string }>('idle');

  async function ask() {
    if (!order) return;
    setState('busy');
    try {
      const { link } = await getDriverLink(order.id);
      if (!link || link.expired) { setState('none'); return; }
      const text = `Hi${link.driverName ? ` ${link.driverName.split(' ')[0]}` : ''}, please send pictures of your truck and trailer `
        + `with the plate and the DOT number on the door readable. You can add them here: ${link.url}`;
      if (await copyToClipboard(text)) {
        setState('copied');
        window.setTimeout(() => setState('idle'), 2500);
      } else {
        setState({ manual: text });
      }
    } catch {
      setState('none');
    }
  }

  if (typeof state === 'object') {
    return (
      <textarea readOnly value={state.manual} rows={3} onFocus={(e) => e.currentTarget.select()} autoFocus
        className="w-full rounded-md border border-gray-300 p-1.5 text-[11px] text-gray-700" />
    );
  }
  return (
    <span className="inline-flex flex-col">
      <button type="button" onClick={() => void ask()} disabled={state === 'busy'}
        title="Copies a message with the driver's link in it"
        className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50">
        {state === 'copied'
          ? <><Check className="h-3.5 w-3.5 text-green-600" /> <span data-es>Message copied</span></>
          : <><MessageSquareText className="h-3.5 w-3.5" /> <span data-es>Ask the driver</span><Copy className="h-3 w-3 opacity-50" /></>}
      </button>
      {state === 'none' && (
        <span data-es className="text-[11px] text-amber-700">No driver link yet. Make one in the Carrier section.</span>
      )}
    </span>
  );
}
