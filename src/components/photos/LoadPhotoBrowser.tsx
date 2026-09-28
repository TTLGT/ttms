'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  CalendarDays, GalleryHorizontal, Images, LayoutDashboard, LayoutGrid, Package, Search, Table2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  deleteLoadPhoto,
  listPhotoDocuments,
  setOrderCover,
  updateLoadPhoto,
} from '@/lib/loadPhotos';
import {
  PHOTO_STAGES,
  PHOTO_STAGE_LABEL,
  commodityKey,
  type LoadPhotoRow,
  type PhotoStage,
} from '@/types/loadPhoto';
import PhotoLightbox from './PhotoLightbox';
import PhotoReel from './PhotoReel';
import { CoverMark, StageBadge } from './PhotoBits';

type ViewId = 'grid' | 'collage' | 'table' | 'loads' | 'commodity' | 'timeline';
type SortId = 'newest' | 'oldest' | 'order' | 'commodity';

const VIEWS: { id: ViewId; label: string; icon: typeof Images; hint: string }[] = [
  { id: 'grid',      label: 'Grid',         icon: LayoutGrid,        hint: 'Even tiles, easiest to scan' },
  { id: 'collage',   label: 'Collage',      icon: LayoutDashboard,   hint: 'Every picture in its own shape' },
  { id: 'table',     label: 'Table',        icon: Table2,            hint: 'Details beside each picture' },
  { id: 'loads',     label: 'By load',      icon: GalleryHorizontal, hint: 'One reel per load' },
  { id: 'commodity', label: 'By commodity', icon: Package,           hint: 'Grouped by what they show' },
  { id: 'timeline',  label: 'Timeline',     icon: CalendarDays,      hint: 'Grouped by the day they were added' },
];

const SORTS: { id: SortId; label: string }[] = [
  { id: 'newest',    label: 'Newest first' },
  { id: 'oldest',    label: 'Oldest first' },
  { id: 'order',     label: 'Order number' },
  { id: 'commodity', label: 'Commodity' },
];

// Remembered per browser: somebody who prefers the collage should not have to
// pick it every visit. Nothing depends on it, so a refused storage is harmless.
const VIEW_KEY = 'ttms.photoView';
function rememberedView(): ViewId {
  try {
    const v = window.localStorage.getItem(VIEW_KEY);
    return VIEWS.some((x) => x.id === v) ? (v as ViewId) : 'grid';
  } catch {
    return 'grid';
  }
}

/** What a picture shows: its own label, or its load's when it has none. */
function labelOf(r: LoadPhotoRow): string {
  return r.commodity || r.orderCommodity || 'Unlabelled';
}

function lane(r: LoadPhotoRow): string {
  return [r.originLabel, r.destinationLabel].filter(Boolean).join(' → ');
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Group { key: string; title: ReactNode; sub?: ReactNode; rows: LoadPhotoRow[] }

/**
 * Every picture on every load the reader can see — the Documents screen's
 * "Load Pictures" view.
 *
 * Read once and filtered in the browser: the list is capped server-side (see
 * /api/documents/photos) and a few hundred rows filter faster here than a
 * round trip would, and without an index per filter combination.
 */
export default function LoadPhotoBrowser() {
  const { user, can } = useAuth();
  const { formatDate, formatDateTime } = useDateFormatters();
  const [rows, setRows]         = useState<LoadPhotoRow[]>([]);
  const [capped, setCapped]     = useState(false);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [view, setView]         = useState<ViewId>('grid');
  const [sort, setSort]         = useState<SortId>('newest');
  const [search, setSearch]     = useState('');
  const [commodity, setCommodity] = useState('');
  const [stages, setStages]     = useState<PhotoStage[]>([]);
  const [coversOnly, setCoversOnly] = useState(false);
  const [openId, setOpenId]     = useState<string | null>(null);

  useEffect(() => { setView(rememberedView()); }, []);
  function chooseView(v: ViewId) {
    setView(v);
    try { window.localStorage.setItem(VIEW_KEY, v); } catch { /* per-browser nicety only */ }
  }

  useEffect(() => {
    listPhotoDocuments()
      .then(({ rows: r, capped: c }) => { setRows(r); setCapped(c); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load pictures'))
      .finally(() => setLoading(false));
  }, []);

  // Commodity choices with counts, grouped the way commodityKey() groups them
  // so spelling and capitals do not split one commodity into three entries.
  const commodities = useMemo(() => {
    const byKey = new Map<string, { label: string; count: number }>();
    for (const r of rows) {
      const label = labelOf(r);
      const key   = commodityKey(label);
      const entry = byKey.get(key);
      if (entry) entry.count += 1; else byKey.set(key, { label, count: 1 });
    }
    return [...byKey.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (coversOnly && !r.isCover) return false;
      if (stages.length && !stages.includes(r.stage)) return false;
      if (commodity && commodityKey(labelOf(r)) !== commodity) return false;
      if (!q) return true;
      return [
        r.orderNumber, r.altNumber ?? '', r.clientName, r.shipperName, r.consigneeName,
        r.commodity, r.orderCommodity, r.caption, r.uploadedByName,
        r.originLabel, r.destinationLabel, PHOTO_STAGE_LABEL[r.stage],
      ].some((v) => v.toLowerCase().includes(q));
    });
    const cmp: Record<SortId, (a: LoadPhotoRow, b: LoadPhotoRow) => number> = {
      newest:    (a, b) => b.createdAt - a.createdAt,
      oldest:    (a, b) => a.createdAt - b.createdAt,
      order:     (a, b) => a.orderNumber.localeCompare(b.orderNumber, undefined, { numeric: true }) || a.createdAt - b.createdAt,
      commodity: (a, b) => labelOf(a).localeCompare(labelOf(b)) || b.createdAt - a.createdAt,
    };
    return [...filtered].sort(cmp[sort]);
  }, [rows, search, commodity, stages, coversOnly, sort]);

  // The grouped views. Each group's rows are in the order they are drawn, so
  // the viewer slides through them in the same order the eye does.
  const groups: Group[] | null = useMemo(() => {
    if (view === 'loads') {
      const byOrder = new Map<string, LoadPhotoRow[]>();
      for (const r of visible) byOrder.set(r.orderId, [...(byOrder.get(r.orderId) ?? []), r]);
      return [...byOrder.values()].map((list) => {
        // A load's own reel always runs in the order it was photographed,
        // whatever the page is sorted by — that is the point of a reel.
        const rs = [...list].sort((a, b) => a.createdAt - b.createdAt);
        const first = rs[0];
        return {
          key: first.orderId,
          title: (
            <Link href={`/dashboard/orders/${first.orderId}?tab=pictures&from=documents`}
              className="font-mono font-semibold text-brand-700 hover:underline">{first.orderNumber}</Link>
          ),
          sub: [first.clientName || first.shipperName, first.orderCommodity, lane(first)].filter(Boolean).join(' · '),
          rows: rs,
        };
      });
    }
    if (view === 'commodity') {
      const byKey = new Map<string, LoadPhotoRow[]>();
      for (const r of visible) {
        const k = commodityKey(labelOf(r));
        byKey.set(k, [...(byKey.get(k) ?? []), r]);
      }
      return [...byKey.entries()]
        .sort(([, a], [, b]) => labelOf(a[0]).localeCompare(labelOf(b[0])))
        .map(([k, rs]) => ({
          key: k,
          title: labelOf(rs[0]),
          sub: `${rs.length} picture${rs.length === 1 ? '' : 's'} · ${new Set(rs.map((r) => r.orderId)).size} load${new Set(rs.map((r) => r.orderId)).size === 1 ? '' : 's'}`,
          rows: rs,
        }));
    }
    if (view === 'timeline') {
      const byDay = new Map<string, LoadPhotoRow[]>();
      for (const r of visible) {
        const k = dayKey(r.createdAt);
        byDay.set(k, [...(byDay.get(k) ?? []), r]);
      }
      return [...byDay.entries()].map(([k, rs]) => ({
        key: k,
        title: formatDate(new Date(rs[0].createdAt)),
        sub: `${rs.length} picture${rs.length === 1 ? '' : 's'}`,
        rows: rs,
      }));
    }
    return null;
  }, [view, visible, formatDate]);

  const sequence = groups ? groups.flatMap((g) => g.rows) : visible;
  const openIndex = openId ? sequence.findIndex((r) => r.id === openId) : -1;

  function toggleStage(s: PhotoStage) {
    setStages((list) => (list.includes(s) ? list.filter((x) => x !== s) : [...list, s]));
  }

  const tile = (r: LoadPhotoRow, className: string, imgClass: string, showMeta = true) => (
    <button key={r.id} type="button" onClick={() => setOpenId(r.id)}
      className={`group relative overflow-hidden rounded-lg bg-gray-100 border border-gray-200 hover:ring-2 hover:ring-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition ${className}`}
      title={[r.orderNumber, r.caption].filter(Boolean).join(' — ')}>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed link to a private bucket */}
      <img src={r.thumbUrl} alt={r.caption} loading="lazy" className={imgClass} />
      {r.isCover && <CoverMark className="absolute right-1.5 top-1.5 w-5 h-5" />}
      {showMeta && (
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pt-6 pb-1.5 text-left">
          <span className="block text-xs font-mono font-semibold text-white">{r.orderNumber}</span>
          <span className="block text-[11px] text-white/80 truncate">{labelOf(r)}</span>
        </span>
      )}
    </button>
  );

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (error) {
    return <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600">{error}</div>;
  }

  const field = 'border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400';

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-3">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by order #, client, commodity, caption, city…"
            className={`${field} w-full pl-8`} />
        </div>
        <select value={commodity} onChange={(e) => setCommodity(e.target.value)} className={`${field} lg:w-56`}
          aria-label="Commodity">
          <option value="">All commodities</option>
          {commodities.map((c) => <option key={c.key} value={c.key}>{c.label} ({c.count})</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortId)} className={`${field} lg:w-40`}
          aria-label="Sort">
          {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
        <div className="flex flex-wrap items-center gap-1.5">
          {PHOTO_STAGES.map((s) => (
            <button key={s} type="button" onClick={() => toggleStage(s)}
              className={`px-2.5 py-0.5 text-xs font-medium rounded-full border transition ${
                stages.includes(s)
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400'
              }`}>
              {PHOTO_STAGE_LABEL[s]}
            </button>
          ))}
          <label className="flex items-center gap-1.5 text-xs text-gray-600 ml-2">
            <input type="checkbox" checked={coversOnly} onChange={(e) => setCoversOnly(e.target.checked)}
              className="rounded border-gray-300" />
            Profile pictures only
          </label>
        </div>
        {/* View switcher */}
        <div className="md:ml-auto inline-flex rounded-lg border border-gray-300 bg-white p-0.5 overflow-x-auto tab-scroll">
          {VIEWS.map((v) => {
            const Icon = v.icon;
            return (
              <button key={v.id} type="button" onClick={() => chooseView(v.id)} title={v.hint}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition ${
                  view === v.id ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}>
                <Icon className="w-3.5 h-3.5" /> {v.label}
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Images className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">
            {rows.length === 0
              ? 'No load pictures yet. Add them from an order’s Pictures tab.'
              : 'No pictures match your search.'}
          </p>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {visible.map((r) => tile(r, 'aspect-square', 'w-full h-full object-cover'))}
        </div>
      ) : view === 'collage' ? (
        // CSS columns rather than a grid: each picture keeps its own height,
        // so nothing is cropped and the wall packs without gaps.
        <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 [&>*]:mb-3">
          {visible.map((r) => tile(r, 'block w-full break-inside-avoid', 'w-full h-auto block'))}
        </div>
      ) : view === 'table' ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Picture', 'Order', 'Client / Shipper', 'Commodity', 'Stage', 'Caption', 'Lane', 'Added'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 transition align-top">
                  <td className="px-4 py-2">{tile(r, 'w-16 h-12 block', 'w-full h-full object-cover', false)}</td>
                  <td className="px-4 py-2">
                    <Link href={`/dashboard/orders/${r.orderId}?tab=pictures&from=documents`}
                      className="text-sm font-mono font-medium text-brand-700 hover:underline">{r.orderNumber}</Link>
                    {r.isCover && <p className="text-[11px] text-amber-700 mt-0.5">Profile picture</p>}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-700">{r.clientName || r.shipperName || '—'}</td>
                  <td className="px-4 py-2 text-sm text-gray-600">{labelOf(r)}</td>
                  <td className="px-4 py-2"><StageBadge stage={r.stage} /></td>
                  <td className="px-4 py-2 text-sm text-gray-600 max-w-xs">{r.caption || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{lane(r) || '—'}</td>
                  <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">
                    {formatDateTime(new Date(r.createdAt))}
                    <span className="block text-gray-400">{r.uploadedByName}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : view === 'loads' ? (
        <div className="space-y-4">
          {groups!.map((g) => (
            <section key={g.key} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 mb-3">
                {g.title}
                {g.sub && <span className="text-xs text-gray-500">{g.sub}</span>}
                <span className="text-xs text-gray-400 ml-auto">{g.rows.length} picture{g.rows.length === 1 ? '' : 's'}</span>
              </div>
              <PhotoReel photos={g.rows} height={140}
                coverPhotoId={g.rows.find((r) => r.isCover)?.id ?? null}
                onOpen={(i) => setOpenId(g.rows[i].id)} />
            </section>
          ))}
        </div>
      ) : (
        // By commodity and Timeline: a heading and a grid per group.
        <div className="space-y-6">
          {groups!.map((g) => (
            <section key={g.key}>
              <div className="flex items-baseline gap-3 mb-2">
                <h3 className="text-sm font-semibold text-gray-900">{g.title}</h3>
                {g.sub && <span className="text-xs text-gray-500">{g.sub}</span>}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {g.rows.map((r) => tile(r, 'aspect-square', 'w-full h-full object-cover'))}
              </div>
            </section>
          ))}
        </div>
      )}

      {visible.length > 0 && (
        <p className="text-xs text-gray-400 mt-4">
          {visible.length} picture{visible.length === 1 ? '' : 's'} across {new Set(visible.map((r) => r.orderId)).size} load{new Set(visible.map((r) => r.orderId)).size === 1 ? '' : 's'}
          {capped && ' · showing the most recent pictures only; search a load from its own Pictures tab for older ones'}
        </p>
      )}

      {openIndex >= 0 && (
        <PhotoLightbox
          photos={sequence}
          index={openIndex}
          onIndex={(i) => setOpenId(sequence[i]?.id ?? null)}
          onClose={() => setOpenId(null)}
          isCover={(p) => p.isCover}
          context={(p) => (
            <span className="text-xs text-white/70">
              <Link href={`/dashboard/orders/${p.orderId}?tab=pictures&from=documents`}
                className="font-mono font-semibold text-white hover:underline">{p.orderNumber}</Link>
              {[p.clientName || p.shipperName, lane(p)].filter(Boolean).map((t) => <span key={t}> · {t}</span>)}
            </span>
          )}
          onSetCover={async (p) => {
            const cover = await setOrderCover(p.orderId, p.id);
            setRows((list) => list.map((r) => (r.orderId === p.orderId ? { ...r, isCover: r.id === cover } : r)));
          }}
          onSave={async (p, patch) => {
            const saved = await updateLoadPhoto(p.orderId, p.id, patch);
            setRows((list) => list.map((r) => (r.id === saved.id ? { ...r, ...saved } : r)));
          }}
          canDelete={(p) => p.uploadedByUid === user?.uid || can('orders.viewAll')}
          onDelete={async (p) => {
            const cover = await deleteLoadPhoto(p.orderId, p.id);
            // Step to a neighbour first, so the viewer stays open on the
            // next picture instead of closing under the reader.
            const next = sequence[openIndex + 1] ?? sequence[openIndex - 1] ?? null;
            setOpenId(next && next.id !== p.id ? next.id : null);
            setRows((list) => list
              .filter((r) => r.id !== p.id)
              .map((r) => (r.orderId === p.orderId ? { ...r, isCover: r.id === cover } : r)));
          }}
          commodityOptions={commodities.map((c) => c.label)}
        />
      )}
    </div>
  );
}
