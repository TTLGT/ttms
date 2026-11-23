'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Cake, PartyPopper, RotateCcw } from 'lucide-react';
import {
  getAppSettings,
  previewCelebrations,
  saveCelebrationTemplates,
  saveCelebrations,
  type CelebrationRun,
} from '@/lib/appSettings';
import { fetchCalendar } from '@/lib/celebrationCalendar';
import { useAuth } from '@/context/AuthContext';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { DEFAULT_APP_SETTINGS } from '@/types/appSettings';
import { Bi } from '@/components/spanish/Es';
import CelebrationPost from '@/components/chat/CelebrationPost';
import {
  DEFAULT_CELEBRATION_TEMPLATES,
  MAX_TEMPLATE_LENGTH,
  TEMPLATE_PLACEHOLDERS,
  celebrationCards,
  validateTemplate,
  type Celebration,
  type CelebrationKind,
  type CelebrationTemplates,
} from '@/types/celebration';
import { occurrencesInMonth, type CalendarOccurrence } from '@/types/celebrationCalendar';
import type { ChatMessage } from '@/types/conversation';
import { useSaveBarEntry } from './kit/SaveBar';
import { Loading, Notice, OptionCards, PreviewBox, SettingsCard, useStagedAction } from './kit/ui';

/**
 * The daily birthday and work-anniversary post in the Everyone room: whether
 * it goes out, and what it says.
 *
 * Admin and HR, through `celebrations.manage`. HR rather than only admin
 * because the wording of a company greeting is HR's work, and because they
 * already hold the birthdays and start dates it is built from, so it widens
 * nothing.
 *
 * Three previews, because this is the only thing in TTMS that happens while
 * nobody is looking:
 *
 * - **The cards themselves**, drawn by the same component the chat uses, from
 *   the wording as it is being typed — with made-up names, so trying a
 *   wording never puts a real colleague's name on screen for nothing.
 * - **Today**, as the 8am run would post it, from the server — the only way
 *   to tell a quiet room (nobody has a date on file) from a broken one.
 * - **Who's next** — the next few people the post will name, names only, as
 *   the post shows them. Only for somebody who may read the dates anyway
 *   (`people.view`); it comes from the same route as the Calendar's layer.
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
  { kind: 'birthday', label: 'Birthdays', hint: 'One line, however many people share the day.' },
  { kind: 'anniversary', label: 'Work anniversaries', hint: 'One line for each person, because the number of years is different for each of them.' },
];

/** Made-up people for the card preview — never a real colleague. */
const SAMPLE: Celebration[] = [
  { kind: 'birthday', name: 'Ana Ruiz', uid: 'preview-ana', years: 0 },
  { kind: 'anniversary', name: 'Luis Morales', uid: 'preview-luis', years: 3 },
];

/** A message shaped like the real post, for the preview. Never written anywhere. */
function previewMessage(text: string): ChatMessage {
  const eight = new Date();
  eight.setHours(8, 0, 0, 0);
  return {
    id: 'preview',
    text,
    senderUid: 'system',
    senderName: 'Total Transport Logistics',
    createdAt: { toMillis: () => eight.getTime() } as unknown as ChatMessage['createdAt'],
  } as ChatMessage;
}

export default function CelebrationsPanel() {
  const { can } = useAuth();
  const [savedOn, setSavedOn] = useState(DEFAULT_APP_SETTINGS.celebrations);
  const [on, setOn]           = useState(DEFAULT_APP_SETTINGS.celebrations);
  const [saved, setSaved]     = useState<CelebrationTemplates>(DEFAULT_CELEBRATION_TEMPLATES);
  const [templates, setTemplates] = useState<CelebrationTemplates>(DEFAULT_CELEBRATION_TEMPLATES);
  const [run, setRun]         = useState<CelebrationRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const staged = useStagedAction('celebrations');

  const loadPreview = useCallback(async () => {
    try { setRun(await previewCelebrations()); } catch (e) { setError(e instanceof Error ? e.message : 'Could not check today'); }
  }, []);

  useEffect(() => {
    getAppSettings()
      .then((res) => {
        setSavedOn(res.settings.celebrations);
        setOn(res.settings.celebrations);
        setTemplates(res.settings.celebrationTemplates);
        setSaved(res.settings.celebrationTemplates);
      })
      .then(loadPreview)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load the setting'))
      .finally(() => setLoading(false));
  }, [loadPreview]);

  useEffect(() => {
    if (!loading && staged) setOn(staged === 'on');
  }, [loading, staged]);

  const problems: Record<CelebrationKind, string> = {
    birthday:    validateTemplate('birthday', templates.birthday),
    anniversary: validateTemplate('anniversary', templates.anniversary),
  };
  const broken = problems.birthday || problems.anniversary;
  const wordingChanged = templates.birthday !== saved.birthday || templates.anniversary !== saved.anniversary;
  const switchChanged = on !== savedOn;

  const { active } = useSaveBarEntry({
    dirty: !loading && (wordingChanged || switchChanged),
    problem: wordingChanged && broken ? broken : undefined,
    save: async () => {
      const before = { on: savedOn, templates: saved };
      if (switchChanged) { await saveCelebrations(on); setSavedOn(on); }
      if (wordingChanged) { await saveCelebrationTemplates(templates); setSaved(templates); }
      await loadPreview();
      return async () => {
        if (switchChanged) { await saveCelebrations(before.on); setSavedOn(before.on); setOn(before.on); }
        if (wordingChanged) { await saveCelebrationTemplates(before.templates); setSaved(before.templates); setTemplates(before.templates); }
        await loadPreview();
      };
    },
    discard: () => { setOn(savedOn); setTemplates(saved); },
  });

  // The cards drawn from what is typed — a broken template falls back to the
  // standard wording, exactly as the real post would.
  const cards = useMemo(() => celebrationCards(SAMPLE, templates), [templates]);

  if (loading) return <SettingsCard><Loading /></SettingsCard>;

  return (
    <div className="space-y-6">
      <SettingsCard
        title="Post the message"
        description="A message in the Everyone room at 8am Guatemala time, on the day, naming whoever has a birthday or a work anniversary. It is signed Total Transport Logistics, and never carries a date of birth, a birth year or an age."
      >
        <OptionCards
          name="celebrations"
          value={on}
          saved={savedOn}
          onChange={setOn}
          columns={2}
          options={[
            { value: true, title: 'On', detail: 'Post the message on the days somebody is celebrating. Nothing is posted on a day when nobody is.' },
            { value: false, title: 'Off', detail: 'Post nothing. Everybody keeps their own choice, so switching back on puts it all back as it was.' },
          ]}
        />
      </SettingsCard>

      <SettingsCard
        title="What it says"
        description="Write it however this company would say it. The words in braces are filled in when the message is sent — everything else goes out exactly as typed."
        aside={
          <button type="button" onClick={() => setTemplates(DEFAULT_CELEBRATION_TEMPLATES)}
            className="flex items-center gap-1 text-xs text-gray-500 underline-offset-2 hover:underline">
            <RotateCcw className="h-3 w-3" /> <span data-es>Back to the standard wording</span>
          </button>
        }
      >
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <div className="space-y-5">
            {EDITORS.map(({ kind, label, hint }) => (
              <TemplateEditor
                key={kind}
                kind={kind}
                label={label}
                hint={hint}
                value={templates[kind]}
                problem={problems[kind]}
                onChange={(text) => setTemplates((t) => ({ ...t, [kind]: text }))}
              />
            ))}
            {!active && (wordingChanged || switchChanged) && (
              <button type="button" disabled={Boolean(broken)}
                onClick={() => void (async () => {
                  if (switchChanged) { await saveCelebrations(on); setSavedOn(on); }
                  if (wordingChanged) { await saveCelebrationTemplates(templates); setSaved(templates); }
                })()}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save</button>
            )}
          </div>
          <PreviewBox title="How it will look" note="Made-up names, with the wording as it is typed now. Nothing here is saved until you press Save.">
            <div className="rounded-xl bg-gray-50 p-2">
              <CelebrationPost message={previewMessage(cards.map((c) => c.line).join('\n'))} cards={cards} />
            </div>
          </PreviewBox>
        </div>
      </SettingsCard>

      <div className="grid gap-6 lg:grid-cols-2">
        {run && (
          <SettingsCard title="Today, in the Everyone room">
            {run.message ? <p className="whitespace-pre-line text-sm text-gray-900">{run.message}</p> : null}
            <p className="mt-2 text-xs text-gray-500"><Bi>{OUTCOME_NOTE[run.outcome]}</Bi></p>
            {wordingChanged && run.message && (
              <p className="mt-2 text-xs text-amber-700">
                <Bi>This is the wording that is saved, not what is typed above. Save to see the change here.</Bi>
              </p>
            )}
          </SettingsCard>
        )}
        {can('people.view') && <WhosNext on={on} />}
      </div>

      <div className="space-y-2 text-xs leading-relaxed text-gray-500">
        <p>
          <Bi>A birthday and a start date are only visible to administrators and HR, so being named
          here is each person&apos;s own decision: everyone can switch either one off on their own
          profile page, and nobody is asked or told when they do.</Bi>
        </p>
        <p>
          <Bi>Somebody with no birthday or start date on file is never named, and neither is anybody
          suspended or still waiting to sign in for the first time.</Bi>
        </p>
      </div>

      {error && <Notice tone="red">{error}</Notice>}
    </div>
  );
}

/**
 * The next few people the post will name, names only — the same line the
 * post itself holds to. People who asked not to be named, anybody pending,
 * and an anniversary under one year are left out, as the post leaves them out.
 */
function WhosNext({ on }: { on: boolean }) {
  const { formatCalendarDate } = useDateFormatters();
  const [next, setNext] = useState<CalendarOccurrence[] | null>(null);

  useEffect(() => {
    fetchCalendar()
      .then((data) => {
        const [y, m] = data.today.split('-').map(Number);
        const months = [0, 1].map((k) => {
          const mm = ((m - 1 + k) % 12) + 1;
          const yy = y + Math.floor((m - 1 + k) / 12);
          return occurrencesInMonth(data.people, yy, mm);
        }).flat();
        setNext(months
          .filter((o) => o.date >= data.today
            && o.person.announced[o.kind]
            && !o.person.pending
            && (o.kind === 'birthday' || o.years >= 1))
          .slice(0, 4));
      })
      .catch(() => setNext([]));
  }, []);

  return (
    <SettingsCard title="Who’s next">
      {!next ? <Loading /> : next.length === 0 ? (
        <p className="text-sm text-gray-500"><Bi>Nobody in the next few weeks.</Bi></p>
      ) : (
        <ul className="space-y-2">
          {next.map((o) => (
            <li key={`${o.kind}-${o.person.email}-${o.date}`} className="flex items-center gap-3 text-sm">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full ${o.kind === 'birthday' ? 'bg-pink-100 text-pink-600' : 'bg-blue-100 text-blue-700'}`}>
                {o.kind === 'birthday' ? <Cake size={15} /> : <PartyPopper size={15} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-gray-900">{o.person.name}</span>
                <span className="block text-xs text-gray-500">
                  {o.kind === 'birthday' ? 'Birthday' : `${o.years} year${o.years === 1 ? '' : 's'} with the company`}
                </span>
              </span>
              <span className="text-xs tabular-nums text-gray-500">{formatCalendarDate(o.date)}</span>
            </li>
          ))}
        </ul>
      )}
      {!on && <p className="mt-3 text-xs text-amber-700"><Bi>The message is switched off, so none of these will be posted.</Bi></p>}
    </SettingsCard>
  );
}

/**
 * One template, with its placeholders listed under it. A token TTMS does not
 * recognise is refused rather than printed, so `{Name}` is an error here
 * instead of something the whole company reads on somebody's anniversary.
 */
function TemplateEditor({
  kind, label, hint, value, problem, onChange,
}: {
  kind: CelebrationKind;
  label: string;
  hint: string;
  value: string;
  problem: string;
  onChange: (text: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-900" htmlFor={`template-${kind}`}>
        <Bi>{label}</Bi>
      </label>
      <p className="mt-0.5 text-xs text-gray-500"><Bi>{hint}</Bi></p>
      <textarea
        id={`template-${kind}`}
        value={value}
        rows={2}
        maxLength={MAX_TEMPLATE_LENGTH}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1.5 w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 ${
          problem ? 'border-red-300 focus:border-red-400 focus:ring-red-300' : 'border-gray-200 focus:border-brand-400 focus:ring-brand-300'
        }`}
      />
      {problem && <p className="mt-1 text-xs text-red-600">{problem}</p>}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {TEMPLATE_PLACEHOLDERS[kind].map((p) => (
          <button key={p.token} type="button" title={p.detail} onClick={() => onChange(`${value}${p.token}`)}
            className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-600 transition hover:border-brand-300 hover:text-brand-700">
            {p.token}
          </button>
        ))}
      </div>
    </div>
  );
}
