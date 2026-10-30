'use client';

import { useRef, useState } from 'react';
import { Camera, Check, CircleDollarSign, ImagePlus, MapPin, Navigation, Paperclip } from 'lucide-react';
import { prepareLoadPhoto } from '@/lib/imagePrep';
import { DRIVER_STEPS, stepNeedsPhoto, type DriverPoint, type DriverProgress, type DriverStep } from '@/types/driverLink';
import { PHOTO_STAGES, type PhotoStage } from '@/types/loadPhoto';
import { DriverHeader, useDriverLang } from './DriverChrome';
import { errorText, type Lang, type Strings } from './strings';

export interface DriverStopView {
  name: string;
  lines: string[];
  date: number | null;
  dateEnd: number | null;
  mapUrl: string;
}

export interface DriverPageData {
  token: string;
  orderNumber: string;
  driverName: string;
  pickups: DriverStopView[];
  deliveries: DriverStopView[];
  freight: string;
  progress: DriverProgress;
  cod: boolean;
  codAmount: string | null;
  paidAt: { driverPaid: number | null; clientPaid: number | null };
  delivered: boolean;
}

/** Matches MAX_DRIVER_PROOF_BYTES on the server. */
const MAX_PROOF_BYTES = 4_000_000;

class SendError extends Error {}

/**
 * Asks the phone where it is. Never throws: a step still goes without a
 * location when the driver said no, the sky is not visible, or ten seconds
 * pass — a stuck spinner at a dock door is worse than a missing pin.
 */
function getPoint(): Promise<DriverPoint | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

function addPoint(form: FormData, p: DriverPoint | null) {
  if (!p) return;
  form.set('lat', String(p.lat));
  form.set('lng', String(p.lng));
  if (p.accuracy !== null) form.set('accuracy', String(p.accuracy));
}

/** Dates on the load are calendar days, stored at the office's midnight; read them in UTC so the day never slips. */
function day(ms: number, lang: Lang): string {
  return new Date(ms).toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function when(ms: number, lang: Lang): string {
  return new Date(ms).toLocaleString(lang === 'es' ? 'es-US' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function DriverPanel({ data }: { data: DriverPageData }) {
  const [lang, t, setLang] = useDriverLang();
  const [progress, setProgress] = useState<DriverProgress>(data.progress);
  const [delivered, setDelivered] = useState(data.delivered || Boolean(data.progress.delivered));
  const [paidAt, setPaidAt] = useState(data.paidAt);
  const [busy, setBusy] = useState<string>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function send(form: FormData): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await fetch(`/api/driver/${data.token}`, { method: 'POST', body: form });
    } catch {
      throw new SendError(t.network);
    }
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (res.status === 401) {
      // The cookie is gone (cleared, another browser): ask for the phone again.
      window.location.reload();
      throw new SendError('');
    }
    if (!res.ok) throw new SendError(res.status === 413 ? t.tooBig : errorText(t, body.error));
    return body;
  }

  async function run(key: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof SendError ? e.message : e instanceof Error ? e.message : t.failed);
    } finally {
      setBusy('');
    }
  }

  function tapStep(step: DriverStep, photo?: { photo: Blob; thumb: Blob; width: number; height: number }) {
    return run(step, async () => {
      const point = await getPoint();
      const form = new FormData();
      form.set('action', 'step');
      form.set('step', step);
      addPoint(form, point);
      if (photo) {
        form.set('photo', photo.photo, 'photo.jpg');
        form.set('thumb', photo.thumb, 'thumb.jpg');
        form.set('width', String(photo.width));
        form.set('height', String(photo.height));
      }
      const body = await send(form);
      setProgress((p) => ({ ...p, [step]: { at: Date.now(), point } }));
      if (step === 'delivered') setDelivered(true);
      if (!body.moved && !body.already && (step === 'picked_up' || step === 'in_transit' || step === 'delivered')) {
        setNotice(t.notMoved);
      }
    });
  }

  const nextStep = DRIVER_STEPS.find((s) => !progress[s]);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 pb-16">
      <div className="mx-auto max-w-md space-y-4">
        <DriverHeader t={t} lang={lang} setLang={setLang} orderNumber={data.orderNumber} />

        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {notice && <p className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">{notice}</p>}

        <Stops title={t.pickup} stops={data.pickups} t={t} lang={lang} />
        <Stops title={t.delivery} stops={data.deliveries} t={t} lang={lang} />
        {data.freight && (
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t.freight}</p>
            <p className="mt-1 text-sm text-gray-800">{data.freight}</p>
            {data.cod && data.codAmount && (
              <p className="mt-2 text-sm font-semibold text-gray-900">{t.codCollect(data.codAmount)}</p>
            )}
          </Card>
        )}

        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t.steps}</p>
          <p className="mb-3 mt-1 text-xs text-gray-500">{t.stepsHint}</p>
          <ol className="space-y-2">
            {DRIVER_STEPS.map((step) => {
              const mark = progress[step];
              if (mark) {
                return (
                  <li key={step} className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-3">
                    <Check className="h-5 w-5 shrink-0 text-green-700" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{t.step[step]}</p>
                      <p className="text-xs text-gray-600">{when(mark.at, lang)}</p>
                    </div>
                  </li>
                );
              }
              if (stepNeedsPhoto(step)) {
                return <PhotoStep key={step} step={step} t={t} busy={busy === step} disabled={Boolean(busy)}
                  highlight={nextStep === step} onSend={(photo) => tapStep(step, photo)} onError={setError} />;
              }
              return (
                <li key={step}>
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void tapStep(step)}
                    className={`w-full rounded-lg px-4 py-3.5 text-left text-base font-semibold transition disabled:opacity-60 ${
                      nextStep === step ? 'bg-brand-600 text-white hover:bg-brand-700' : 'border border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    {busy === step ? t.sending : t.step[step]}
                  </button>
                </li>
              );
            })}
          </ol>
        </Card>

        <LocationCard t={t} busy={busy === 'location'} disabled={Boolean(busy)}
          onSend={() => run('location', async () => {
            const point = await getPoint();
            if (!point) throw new SendError(t.noLocation);
            const form = new FormData();
            form.set('action', 'location');
            addPoint(form, point);
            await send(form);
            setNotice(t.locationSent);
          })} />

        <PhotosCard t={t} busy={busy === 'photos'} disabled={Boolean(busy)}
          onSend={(files, stage, caption) => run('photos', async () => {
            let sent = 0;
            for (const file of files) {
              const prepared = await prepareLoadPhoto(file);
              const form = new FormData();
              form.set('action', 'photo');
              form.set('photo', prepared.photo, 'photo.jpg');
              form.set('thumb', prepared.thumb, 'thumb.jpg');
              form.set('width', String(prepared.width));
              form.set('height', String(prepared.height));
              form.set('stage', stage);
              form.set('caption', caption);
              await send(form);
              sent += 1;
            }
            setNotice(t.uploaded(sent));
          })} />

        <PaymentCard t={t} lang={lang} cod={data.cod} delivered={delivered}
          paidAt={data.cod ? paidAt.clientPaid : paidAt.driverPaid}
          busy={busy === 'paid'} disabled={Boolean(busy)}
          onSend={(file, note) => run('paid', async () => {
            let proof: Blob = file;
            let name = file.name || 'proof';
            // A picture is shrunk like any other; a PDF goes as it is.
            if (file.type.startsWith('image/')) {
              proof = (await prepareLoadPhoto(file)).photo;
              name = 'payment.jpg';
            } else if (file.size > MAX_PROOF_BYTES) {
              throw new SendError(t.tooBig);
            }
            const form = new FormData();
            form.set('action', 'paid');
            form.set('mark', data.cod ? 'clientPaid' : 'driverPaid');
            form.set('proof', proof, name);
            form.set('note', note);
            await send(form);
            const now = Date.now();
            setPaidAt((p) => (data.cod ? { ...p, clientPaid: now } : { ...p, driverPaid: now }));
          })} />
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-gray-200 bg-white p-4">{children}</div>;
}

function Stops({ title, stops, t, lang }: { title: string; stops: DriverStopView[]; t: Strings; lang: Lang }) {
  return (
    <>
      {stops.map((s, i) => (
        <Card key={i}>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {title}{stops.length > 1 ? ` ${i + 1}` : ''}
          </p>
          {s.name && <p className="mt-1 text-base font-semibold text-gray-900">{s.name}</p>}
          {s.lines.map((l) => <p key={l} className="text-sm text-gray-700">{l}</p>)}
          {s.date && (
            <p className="mt-1 text-sm text-gray-600">
              {day(s.date, lang)}{s.dateEnd && s.dateEnd !== s.date ? ` – ${day(s.dateEnd, lang)}` : ''}
            </p>
          )}
          {s.mapUrl && (
            <a href={s.mapUrl} target="_blank" rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600">
              <Navigation className="h-4 w-4" /> {t.directions}
            </a>
          )}
        </Card>
      ))}
    </>
  );
}

/**
 * A step that needs its picture — Picked up and Delivered (STEP_PHOTO).
 * Two buttons rather than one: `capture` opens the camera straight away on a
 * phone, and the other lets a driver who already took the picture pick it.
 */
function PhotoStep({ step, t, busy, disabled, highlight, onSend, onError }: {
  step: DriverStep; t: Strings; busy: boolean; disabled: boolean; highlight: boolean;
  onSend: (photo: { photo: Blob; thumb: Blob; width: number; height: number }) => Promise<void>;
  onError: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string>('');
  const [prepared, setPrepared] = useState<{ photo: Blob; thumb: Blob; width: number; height: number } | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  async function pick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    try {
      const p = await prepareLoadPhoto(file);
      setPrepared(p);
      setPreview(URL.createObjectURL(p.thumb));
    } catch (e) {
      onError(e instanceof Error ? e.message : t.failed);
    }
  }

  if (!open) {
    return (
      <li>
        <button type="button" disabled={disabled} onClick={() => setOpen(true)}
          className={`w-full rounded-lg px-4 py-3.5 text-left text-base font-semibold transition disabled:opacity-60 ${
            highlight ? 'bg-brand-600 text-white hover:bg-brand-700' : 'border border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
          }`}>
          {t.step[step]}
        </button>
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-brand-300 bg-brand-50 p-3">
      <p className="text-sm font-semibold text-gray-900">{t.step[step]}</p>
      <p className="mt-1 text-xs text-gray-600">{t.stepNeedsPhoto[step === 'picked_up' ? 'picked_up' : 'delivered']}</p>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { void pick(e.target.files); e.target.value = ''; }} />
      <input ref={gallery} type="file" accept="image/*" className="hidden"
        onChange={(e) => { void pick(e.target.files); e.target.value = ''; }} />
      {preview && (
        // A local object URL of the shrunk picture; next/image has nothing to optimise here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="mt-3 max-h-48 rounded-lg border border-gray-200" />
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => camera.current?.click()} disabled={disabled}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-800">
          <Camera className="h-4 w-4" /> {t.takePhoto}
        </button>
        <button type="button" onClick={() => gallery.current?.click()} disabled={disabled}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-800">
          <ImagePlus className="h-4 w-4" /> {t.choosePhoto}
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={!prepared || disabled}
          onClick={() => prepared && void onSend(prepared)}
          className="flex-1 rounded-lg bg-brand-600 px-4 py-3 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {busy ? t.sending : t.confirmStep(t.step[step])}
        </button>
        <button type="button" disabled={busy} onClick={() => { setOpen(false); setPrepared(null); setPreview(''); }}
          className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-700">
          {t.cancel}
        </button>
      </div>
    </li>
  );
}

function LocationCard({ t, busy, disabled, onSend }: { t: Strings; busy: boolean; disabled: boolean; onSend: () => void }) {
  return (
    <Card>
      <button type="button" disabled={disabled} onClick={onSend}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-base font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60">
        <MapPin className="h-5 w-5" /> {busy ? t.sending : t.sendLocation}
      </button>
      <p className="mt-2 text-xs text-gray-500">{t.locationHelp}</p>
    </Card>
  );
}

function PhotosCard({ t, busy, disabled, onSend }: {
  t: Strings; busy: boolean; disabled: boolean;
  onSend: (files: File[], stage: PhotoStage, caption: string) => Promise<void>;
}) {
  const [stage, setStage] = useState<PhotoStage>('commodity');
  const [caption, setCaption] = useState('');
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length) void onSend(files, stage, caption).then(() => setCaption(''));
  }

  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t.pictures}</p>
      <p className="mb-3 mt-1 text-xs text-gray-500">{t.picturesHint}</p>
      <label className="mb-1 block text-xs font-medium text-gray-600">{t.photoType}</label>
      <select value={stage} onChange={(e) => setStage(e.target.value as PhotoStage)}
        className="mb-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base">
        {PHOTO_STAGES.map((s) => <option key={s} value={s}>{t.photoStage[s]}</option>)}
      </select>
      <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={t.caption} maxLength={300}
        className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base" />
      {/* `capture` opens the phone's camera straight away, one picture a
          press; the gallery button takes several already on the phone. On a
          computer, `capture` is ignored and both open the file picker. */}
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
      <input ref={gallery} type="file" accept="image/*" multiple className="hidden" onChange={pick} />
      {busy ? (
        <p className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-center text-base font-semibold text-gray-800">{t.sending}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={disabled} onClick={() => camera.current?.click()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-3 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
            <Camera className="h-5 w-5" /> {t.takePhoto}
          </button>
          <button type="button" disabled={disabled} onClick={() => gallery.current?.click()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-3 text-base font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60">
            <ImagePlus className="h-5 w-5" /> {t.choosePhoto}
          </button>
        </div>
      )}
    </Card>
  );
}

function PaymentCard({ t, lang, cod, delivered, paidAt, busy, disabled, onSend }: {
  t: Strings; lang: Lang; cod: boolean; delivered: boolean; paidAt: number | null;
  busy: boolean; disabled: boolean; onSend: (file: File, note: string) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const label = cod ? t.paidCod : t.paidDriver;

  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t.payment}</p>
      {paidAt ? (
        <div className="mt-2 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-3">
          <CircleDollarSign className="h-5 w-5 shrink-0 text-green-700" />
          <div>
            <p className="text-sm font-semibold text-gray-900">{label}</p>
            <p className="text-xs text-gray-600">{t.recordedOn(when(paidAt, lang))}</p>
          </div>
        </div>
      ) : !delivered ? (
        <p className="mt-2 text-sm text-gray-500">{t.waitDelivered}</p>
      ) : (
        <>
          <p className="mb-3 mt-1 text-xs text-gray-500">{cod ? t.paidCodHint : t.paidDriverHint}</p>
          <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          <input ref={input} type="file" accept="image/*,application/pdf" className="hidden"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          {file && (
            <p className="mb-2 flex items-center gap-1.5 truncate text-sm text-gray-800">
              <Paperclip className="h-4 w-4 shrink-0" /> {file.name}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={disabled} onClick={() => camera.current?.click()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50">
              <Camera className="h-4 w-4" /> {t.takePhoto}
            </button>
            <button type="button" disabled={disabled} onClick={() => input.current?.click()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50">
              <Paperclip className="h-4 w-4" /> {t.attachProof}
            </button>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.caption} maxLength={300}
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base" />
          <button type="button" disabled={!file || disabled}
            onClick={() => file && void onSend(file, note)}
            className="mt-3 w-full rounded-lg bg-brand-600 px-4 py-3 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {busy ? t.sending : label}
          </button>
        </>
      )}
    </Card>
  );
}
