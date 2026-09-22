'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import {
  getAppSettings,
  previewCelebrations,
  saveCelebrationTemplates,
  saveCelebrations,
  type CelebrationRun,
} from '@/lib/appSettings';
import { DEFAULT_APP_SETTINGS } from '@/types/appSettings';
import {
  DEFAULT_CELEBRATION_TEMPLATES,
  MAX_TEMPLATE_LENGTH,
  TEMPLATE_PLACEHOLDERS,
  validateTemplate,
  type CelebrationKind,
  type CelebrationTemplates,
} from '@/types/celebration';

/**
 * The daily birthday and work-anniversary post in the Everyone room: whether
 * it goes out, and what it says.
 *
 * Admin and HR, through `celebrations.manage` — the one panel on this tab a
 * non-admin can open. HR rather than only admin because the wording of a
 * company greeting is HR's work, and because they already hold the birthdays
 * and start dates it is built from, so it widens nothing.
 *
 * The panel shows what would go out *today* as well as the controls, because
 * this is the only thing in TTMS that happens while nobody is looking. Without
 * the preview, the only way to find out whether it works — or what an edit
 * actually reads like — is to wait until 8am and see. It is also the only way
 * to tell the ordinary reason for a quiet room (nobody has a date on file)
 * from something being broken.
 */

/** What each outcome means, in the reader's terms rather than the code's. */
const OUTCOME_NOTE: Record<CelebrationRun['outcome'], string> = {
  posted:           'Sent.',
  preview:          'This goes out at 8am Guatemala time.',
  'already-posted': 'This already went out this morning. It will not be sent twice.',
  disabled:         'Nothing will be posted while this is switched off.',
  nobody:           'Nobody has a birthday or a work anniversary today.',
  'no-room':        'The Everyone room does not exist yet — it is created the first time somebody opens chat.',
};

const EDITORS: { kind: CelebrationKind; label: string; hint: string }[] = [
  {
    kind: 'birthday',
    label: 'Birthdays',
    hint: 'One line, however many people share the day.',
  },
  {
    kind: 'anniversary',
    label: 'Work anniversaries',
    hint: 'One line for each person, because the number of years is different for each of them.',
  },
];

export default function CelebrationsPanel() {
  const [on, setOn]               = useState(DEFAULT_APP_SETTINGS.celebrations);
  const [templates, setTemplates] = useState<CelebrationTemplates>(DEFAULT_CELEBRATION_TEMPLATES);
  /** What was last saved, so Save can be offered only when something changed. */
  const [saved, setSaved]         = useState<CelebrationTemplates>(DEFAULT_CELEBRATION_TEMPLATES);
  const [run, setRun]             = useState<CelebrationRun | null>(null);
  const [loading, setLoading]     = useState(true);
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState('');
  const [done, setDone]           = useState('');

  const loadPreview = useCallback(async () => {
    try {
      setRun(await previewCelebrations());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check today');
    }
  }, []);

  useEffect(() => {
    getAppSettings()
      .then((res) => {
        setOn(res.settings.celebrations);
        setTemplates(res.settings.celebrationTemplates);
        setSaved(res.settings.celebrationTemplates);
      })
      .then(loadPreview)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load the setting'))
      .finally(() => setLoading(false));
  }, [loadPreview]);

  const problems: Record<CelebrationKind, string> = {
    birthday:    validateTemplate('birthday', templates.birthday),
    anniversary: validateTemplate('anniversary', templates.anniversary),
  };
  const broken  = Boolean(problems.birthday || problems.anniversary);
  const changed = templates.birthday !== saved.birthday
    || templates.anniversary !== saved.anniversary;

  async function choose(next: boolean) {
    if (next === on || busy) return;
    const previous = on;
    setOn(next);
    setBusy(true);
    setError('');
    setDone('');
    try {
      await saveCelebrations(next);
      setDone('Saved.');
      // Re-read rather than patch: with the switch off the preview reports
      // "disabled" and names nobody, and a stale list beside an off switch
      // would read as a list of people about to be posted anyway.
      await loadPreview();
    } catch (e) {
      setOn(previous);
      setError(e instanceof Error ? e.message : 'Failed to save the setting');
    } finally {
      setBusy(false);
    }
  }

  async function saveWording() {
    if (busy || broken || !changed) return;
    setBusy(true);
    setError('');
    setDone('');
    try {
      await saveCelebrationTemplates(templates);
      setSaved(templates);
      setDone('Saved. Today’s message below is how it will read.');
      await loadPreview();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save the wording');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900">Celebrations</h2>
      <p className="mb-4 mt-1 text-sm text-gray-500">
        A message in the Everyone room at 8am Guatemala time, on the day, naming whoever has a
        birthday or a work anniversary. It is signed <strong>Total Transport Logistics</strong>.
        It never carries a date of birth, a birth year or an age.
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          <div className="space-y-2">
            {[true, false].map((value) => (
              <label
                key={String(value)}
                className={`flex cursor-pointer gap-3 rounded-lg border p-4 transition ${
                  on === value ? 'border-brand-400 bg-brand-50/50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="celebrations"
                  className="mt-1 accent-brand-600"
                  checked={on === value}
                  disabled={busy}
                  onChange={() => void choose(value)}
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{value ? 'On' : 'Off'}</p>
                  <p className="mt-1 text-xs leading-relaxed text-gray-600">
                    {value
                      ? 'Post the message on the days somebody is celebrating. Nothing is posted on a day when nobody is.'
                      : 'Post nothing. Everybody keeps their own choice, so switching back on puts it all back as it was.'}
                  </p>
                </div>
              </label>
            ))}
          </div>

          {/* The wording. Kept under the switch rather than behind a second
              panel: "what does it say" is the first question anybody asks
              about this, and an answer they have to go looking for is one
              they assume they cannot change. */}
          <div className="mt-6 border-t border-gray-100 pt-5">
            <h3 className="text-sm font-semibold text-gray-900">What it says</h3>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              Write it however this company would say it. The words in braces are filled in when
              the message is sent — everything else goes out exactly as typed.
            </p>

            <div className="mt-4 space-y-5">
              {EDITORS.map(({ kind, label, hint }) => (
                <TemplateEditor
                  key={kind}
                  kind={kind}
                  label={label}
                  hint={hint}
                  value={templates[kind]}
                  problem={problems[kind]}
                  disabled={busy}
                  onChange={(text) => {
                    setTemplates((t) => ({ ...t, [kind]: text }));
                    setDone('');
                  }}
                />
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void saveWording()}
                disabled={busy || broken || !changed}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                {busy ? 'Saving…' : 'Save wording'}
              </button>
              {changed && (
                <button
                  type="button"
                  onClick={() => { setTemplates(saved); setDone(''); }}
                  disabled={busy}
                  className="text-xs text-gray-500 underline-offset-2 hover:underline"
                >
                  Undo changes
                </button>
              )}
              <button
                type="button"
                onClick={() => { setTemplates(DEFAULT_CELEBRATION_TEMPLATES); setDone(''); }}
                disabled={busy}
                className="ml-auto flex items-center gap-1 text-xs text-gray-500 underline-offset-2 hover:underline"
              >
                <RotateCcw className="h-3 w-3" /> Back to the standard wording
              </button>
            </div>
          </div>
        </>
      )}

      {/* Today, as it stands. The empty cases are spelled out rather than left
          blank: "nothing here" and "something is wrong" look identical
          otherwise, and this is a feature nobody watches run. */}
      {run && (
        <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Today, in the Everyone room
          </p>
          {run.message ? (
            <p className="mt-2 whitespace-pre-line text-sm text-gray-900">{run.message}</p>
          ) : null}
          <p className="mt-2 text-xs text-gray-500">{OUTCOME_NOTE[run.outcome]}</p>
          {changed && run.message && (
            <p className="mt-2 text-xs text-amber-700">
              This is the wording that is saved, not what is typed above. Save to see the change
              here.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 space-y-2 text-xs leading-relaxed text-gray-500">
        <p>
          A birthday and a start date are only visible to administrators and HR, so being named
          here is each person&apos;s own decision: everyone can switch either one off on their own
          profile page, and nobody is asked or told when they do.
        </p>
        <p>
          Somebody with no birthday or start date on file is never named, and neither is anybody
          suspended or still waiting to sign in for the first time.
        </p>
      </div>

      {done && !error && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-green-700">
          <Check className="h-3.5 w-3.5" /> {done}
        </p>
      )}
      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}
    </section>
  );
}

/**
 * One template, with its placeholders listed under it.
 *
 * The list is not decoration: a token TTMS does not recognise is refused
 * rather than printed, so `{Name}` is an error here instead of something the
 * whole company reads on somebody's anniversary. Clicking one inserts it,
 * because the difference between `{firstNames}` and `{firstnames}` is not
 * something anybody should have to get right by typing.
 */
function TemplateEditor({
  kind, label, hint, value, problem, disabled, onChange,
}: {
  kind: CelebrationKind;
  label: string;
  hint: string;
  value: string;
  problem: string;
  disabled: boolean;
  onChange: (text: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700" htmlFor={`template-${kind}`}>
        {label}
      </label>
      <p className="mt-0.5 text-[11px] text-gray-500">{hint}</p>

      <textarea
        id={`template-${kind}`}
        value={value}
        rows={2}
        maxLength={MAX_TEMPLATE_LENGTH}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1.5 w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 ${
          problem
            ? 'border-red-300 focus:border-red-400 focus:ring-red-300'
            : 'border-gray-200 focus:border-brand-400 focus:ring-brand-300'
        }`}
      />

      {problem && <p className="mt-1 text-xs text-red-600">{problem}</p>}

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {TEMPLATE_PLACEHOLDERS[kind].map((p) => (
          <button
            key={p.token}
            type="button"
            title={p.detail}
            disabled={disabled}
            onClick={() => onChange(`${value}${p.token}`)}
            className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-600 transition hover:border-brand-300 hover:text-brand-700"
          >
            {p.token}
          </button>
        ))}
      </div>
    </div>
  );
}
