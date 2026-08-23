'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, BookOpen, ChevronDown, ChevronUp, CheckCircle2, Info, Ban,
  KeyRound, List, Search, X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { BOOTSTRAP_ADMIN_EMAILS, ALLOWED_EMAIL_DOMAIN } from '@/lib/accessControl';

/**
 * The administration half of the Admin Handbook, in-app so an admin can reach
 * it without hunting for a document. Deliberately only the operational part:
 * the technical reference is developer material and lives with the code it
 * describes, where it stays in step with the source of truth.
 *
 * Full version: docs/admin-handbook.md in the repository.
 */

const REPO = 'https://github.com/TTLGT/ttms';

/** Below this, a query matches so much of the page that highlighting is noise. */
const MIN_QUERY = 2;

// ── Presentational helpers ───────────────────────────────────────────────────

type Tone = 'info' | 'caution' | 'critical' | 'good';

const TONE: Record<Tone, { box: string; head: string; Icon: typeof Info }> = {
  info:     { box: 'bg-blue-50  border-blue-200',  head: 'text-blue-800',  Icon: Info },
  caution:  { box: 'bg-amber-50 border-amber-200', head: 'text-amber-800', Icon: AlertTriangle },
  critical: { box: 'bg-red-50   border-red-200',   head: 'text-red-800',   Icon: AlertTriangle },
  good:     { box: 'bg-green-50 border-green-200', head: 'text-green-800', Icon: CheckCircle2 },
};

function Callout({ tone, title, children }: { tone: Tone; title: string; children: ReactNode }) {
  const { box, head, Icon } = TONE[tone];
  return (
    <div className={`rounded-lg border px-4 py-3 ${box}`}>
      <p className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${head}`}>
        <Icon size={14} className="flex-shrink-0" />
        {title}
      </p>
      <div className="mt-1.5 space-y-2 text-sm text-gray-700">{children}</div>
    </div>
  );
}

/** "You should see" — the confirmation that a step actually worked. */
function Expect({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-gray-700">
      <CheckCircle2 size={15} className="mt-0.5 flex-shrink-0 text-green-600" />
      <span><span className="font-semibold text-green-800">You should see:</span> {children}</span>
    </p>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return (
    <code className="rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 font-mono text-[13px] text-gray-800">
      {children}
    </code>
  );
}

function Cmd({ children }: { children: ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-gray-900 px-4 py-3 font-mono text-[13px] leading-relaxed text-gray-100">
      {children}
    </pre>
  );
}

function Step({ n, title, time, children }: { n: number; title: string; time?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center gap-3">
        <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-brand-500 font-mono text-sm font-semibold text-white">
          {n}
        </span>
        <h3 className="flex flex-1 flex-wrap items-baseline gap-2 text-base font-semibold text-gray-900">
          {title}
          {time && <span className="font-mono text-[11px] font-normal text-gray-400">{time}</span>}
        </h3>
      </div>
      <div className="space-y-3 text-sm text-gray-700">{children}</div>
    </div>
  );
}

function Row({ cells, header = false }: { cells: ReactNode[]; header?: boolean }) {
  const Cell = header ? 'th' : 'td';
  return (
    <tr className={header ? 'bg-gray-50' : 'border-t border-gray-100'}>
      {cells.map((c, i) => (
        <Cell
          key={i}
          className={`px-3 py-2 text-left align-top ${
            header ? 'text-[11px] font-semibold uppercase tracking-wide text-gray-500' : 'text-gray-700'
          }`}
        >
          {c}
        </Cell>
      ))}
    </tr>
  );
}

function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

/**
 * Chapter bodies are module-level data, so they cannot reach the page's own
 * `jumpTo`. Passing it down by context lets one chapter send the reader to
 * another — opening it as well as scrolling, which a plain `#id` anchor cannot
 * do while chapters are collapsed.
 */
const JumpContext = createContext<(id: string) => void>(() => {});

function ChapterLink({ to, children }: { to: string; children: ReactNode }) {
  const jump = useContext(JumpContext);
  return (
    <button
      type="button"
      onClick={() => jump(to)}
      className="font-semibold text-brand-500 underline underline-offset-2 transition hover:text-brand-600"
    >
      {children}
    </button>
  );
}

// ── Content ──────────────────────────────────────────────────────────────────

/**
 * Sections are data, not markup, so the index and the page cannot drift apart:
 * both are generated from this one list.
 */
interface Chapter {
  id: string;
  title: string;
  subtitle: string;
  body: ReactNode;
}

const CHAPTERS: Chapter[] = [
  {
    id: 'accounts',
    title: 'Accounts, and how you sign in to each',
    subtitle: 'One Google login opens almost everything',
    body: (
      <>
        <p>
          Almost everything is reached with one login: the IT Google account,{' '}
          <Mono>it@{ALLOWED_EMAIL_DOMAIN}</Mono>. That is deliberate — it is a role account, so
          access survives any individual leaving the company.
        </p>
        <Table>
          <thead><Row header cells={['What', 'How you sign in', 'What it is for']} /></thead>
          <tbody>
            <Row cells={[
              <><strong>GitHub</strong> (org <Mono>TTLGT</Mono>)</>,
              <><strong>Continue with Google</strong> — <Mono>it@</Mono></>,
              'Where the TTMS code lives',
            ]} />
            <Row cells={[
              <strong key="fb">Firebase Console</strong>,
              <>Google — <Mono>it@</Mono></>,
              'The database, uploaded files, sign-in and security rules',
            ]} />
            <Row cells={[
              <strong key="vc">Vercel</strong>,
              <>Google — <Mono>it@</Mono></>,
              'Website hosting. The account exists, but TTMS is not deployed on it yet.',
            ]} />
            <Row cells={[
              <strong key="tt">TTMS itself</strong>,
              'Google — your own company address',
              'This app. Being on the access list is what grants entry, not the Google login.',
            ]} />
            <Row cells={[
              <strong key="rs">Resend</strong>,
              'Ask whoever currently runs TTMS',
              'Sends the agreement emails',
            ]} />
          </tbody>
        </Table>

        <Callout tone="critical" title="The lockout escape hatch">
          <p>
            These addresses can always sign in and are always admin, even if the access list is
            empty or damaged. <strong>They cannot be removed or demoted</strong>, and the system is
            right to refuse:
          </p>
          <ul className="list-disc space-y-0.5 pl-5 font-mono text-[13px]">
            {BOOTSTRAP_ADMIN_EMAILS.map((e) => <li key={e}>{e}</li>)}
          </ul>
          <p>If everyone is ever locked out, sign in as one of these.</p>
        </Callout>

        <Callout tone="caution" title="There is no company Claude account">
          <p>
            The AI-assisted development on this project used a <strong>personal, paid Claude
            account</strong> belonging to Erwin Solorzano. It is not part of the handover. TTL would
            need its own plan for anyone to continue that way.
          </p>
          <p>Nothing in TTMS depends on it — everything on this page works without it.</p>
        </Callout>
      </>
    ),
  },

  {
    id: 'daily',
    title: 'Starting and stopping TTMS',
    subtitle: 'The everyday routine — nothing to type',
    body: (
      <>
        {/* This chapter assumes a Desktop shortcut that only step 6 of the setup
            chapter creates. Someone arriving cold at a machine that has never run
            TTMS would otherwise dead-end on the very first line. */}
        <Callout tone="caution" title="No Start TTMS on the Desktop?">
          <p>
            Then this computer has never run TTMS, and the steps below will not work yet. Do{' '}
            <ChapterLink to="setup">Setting it up on a new computer</ChapterLink> first — about 30
            minutes, once per machine — then come back here.
          </p>
          <p>
            You will need the settings file <Mono>.env.local</Mono>, which is not in the repository.
            Step 4 of that chapter says where to get it — you do not need to wait for anyone.
          </p>
        </Callout>

        <h3 className="text-sm font-semibold text-gray-900">Starting it</h3>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Double-click <strong>Start TTMS</strong> on the Desktop.</li>
          <li>A dark window opens. Wait about 10 seconds.</li>
          <li>The browser opens at TTMS. Sign in if asked.</li>
        </ol>

        <h3 className="pt-2 text-sm font-semibold text-gray-900">Stopping it</h3>
        <p>
          Click the dark window and hold <Mono>Ctrl</Mono> and press <Mono>C</Mono>. Or just close
          the window. Either is fine.
        </p>

        <Callout tone="caution" title="Three rules while you are using it">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              <strong>Leave the dark window open.</strong> It <em>is</em> TTMS. Close it and the
              browser will say &ldquo;This site can&rsquo;t be reached&rdquo;.
            </li>
            <li><strong>Minimise it, do not close it.</strong></li>
            <li>
              <strong>After restarting the computer, start it again.</strong> It does not come back
              on its own.
            </li>
          </ol>
        </Callout>

        <h3 className="pt-2 text-sm font-semibold text-gray-900">Getting the latest version</h3>
        <p>
          After a developer makes changes, open the <Mono>ttms</Mono> folder, right-click an empty
          part of the window, choose <strong>Open in Terminal</strong>, and run:
        </p>
        <Cmd>{'git pull\nnpm install'}</Cmd>
        <p>Then close the window and start TTMS normally.</p>
      </>
    ),
  },

  {
    id: 'setup',
    title: 'Setting it up on a new computer',
    subtitle: 'One-off, about 30 minutes — only for a machine that has never run TTMS',
    body: (
      <div className="space-y-4">
        <Step n={1} title="Install Node.js" time="~5 min">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Go to <strong>nodejs.org</strong></li>
            <li>
              Click the green <strong>Download Node.js (LTS)</strong> button. LTS is the stable
              version — if offered &ldquo;Current&rdquo; too, <strong>do not pick it</strong>.
            </li>
            <li>
              Open the downloaded file. Accept the licence, click <strong>Next</strong> on every
              screen, then <strong>Install</strong>. Change nothing.
            </li>
            <li>
              <strong>Restart the computer.</strong> Windows will not find Node.js until you do.
            </li>
          </ol>
        </Step>

        <Step n={2} title="Install Git" time="~5 min">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Go to <strong>git-scm.com/download/win</strong></li>
            <li>
              Open the downloaded file. About ten screens — <strong>click Next on every one</strong>,
              then <strong>Install</strong>.
            </li>
          </ol>
        </Step>

        <Step n={3} title="Copy the code onto the computer" time="~5 min">
          <Callout tone="info" title="GitHub uses the IT Google account">
            <p>
              There is no separate GitHub password. On the sign-in page choose{' '}
              <strong>Continue with Google</strong> and use <Mono>it@{ALLOWED_EMAIL_DOMAIN}</Mono>.
              That account belongs to the <Mono>TTLGT</Mono> organisation, which is what lets you
              download the code.
            </p>
          </Callout>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Open <strong>File Explorer</strong> and click <strong>Desktop</strong>.</li>
            <li>Right-click an empty part of the window → <strong>Open in Terminal</strong>.</li>
            <li>
              Type this and press Enter (right-click inside the window to paste — Ctrl+V often does
              not work):
            </li>
          </ol>
          <Cmd>git clone {REPO}.git</Cmd>
          <Expect>a new folder called <Mono>ttms</Mono> on the Desktop.</Expect>
        </Step>

        <Step n={4} title="Put the settings file in place" time="~2 min">
          <p>
            TTMS needs a small file of passwords called <Mono>.env.local</Mono>, deliberately not
            included with the code. It is kept in the <strong>IT</strong> folder of the{' '}
            <strong>IT &amp; Facilities</strong> Google Drive — sign in as{' '}
            <Mono>it@totaltransportlogistics.us</Mono>, the same account you use for everything
            else. Download it from there.
          </p>
          {/* Named here rather than in docs/admin-handbook.md at the owner's request:
              this page is admin-gated, that file is readable by anyone who can clone
              the repository. Deliberately the location only — never the values. */}
          <Callout tone="critical" title="Handle this file carefully">
            <p>
              That Drive folder, a password manager, a USB stick, or in person. Never{' '}
              <strong>email, chat, or any drive shared more widely.</strong> It is the key to all
              company data.
            </p>
            <p>
              If you ever put a copy somewhere new, check its sharing first — a folder set to{' '}
              <em>anyone with the link</em> is the same as publishing it.
            </p>
          </Callout>
          <p>Put it inside the <Mono>ttms</Mono> folder, alongside <Mono>package.json</Mono>.</p>
          <Callout tone="caution" title="Watch out for a Windows trap">
            <p>
              Windows hides file endings, so a file that looks like <Mono>.env.local</Mono> may
              really be <Mono>.env.local.txt</Mono> — and TTMS will not find it. In File Explorer:{' '}
              <strong>View → Show → File name extensions</strong>. If it ends in <Mono>.txt</Mono>,
              rename it and delete that part.
            </p>
          </Callout>
        </Step>

        <Step n={5} title="Start it for the first time" time="~5 min">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Open <Mono>ttms</Mono> → <Mono>scripts</Mono> and double-click{' '}
              <strong>start-ttms.bat</strong>
            </li>
            <li>
              If Windows says &ldquo;Windows protected your PC&rdquo;, click{' '}
              <strong>More info</strong> → <strong>Run anyway</strong>. It is our own file.
            </li>
            <li>
              It downloads supporting files. <strong>The first time takes 2–5 minutes.</strong>{' '}
              Yellow <Mono>warn</Mono> lines are normal.
            </li>
          </ol>
          <Expect>the browser open by itself at the TTMS login page.</Expect>
        </Step>

        <Step n={6} title="Make a shortcut" time="~1 min">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Right-click <strong>start-ttms.bat</strong> → <strong>Show more options</strong> →{' '}
              <strong>Send to</strong> → <strong>Desktop (create shortcut)</strong>.
            </li>
            <li>Rename it <strong>Start TTMS</strong>.</li>
            <li>
              Right-click it → <strong>Properties</strong> → <strong>Change Icon</strong> →{' '}
              <strong>Browse</strong>, and pick <Mono>ttms\scripts\ttms.ico</Mono>.
            </li>
          </ol>
          <Expect>
            the TTMS logo on the Desktop instead of a blank cog. Chapter 2 is the everyday routine
            from here on.
          </Expect>
        </Step>
      </div>
    ),
  },

  {
    id: 'access',
    title: 'Giving someone access',
    subtitle: 'Adding people, changing roles, suspending and removing',
    body: (
      <>
        <Callout tone="info" title="By design">
          <p>
            Signing in with Google grants nothing on its own. Someone can only get in once their
            address has been added under <strong>Settings → Grant Access</strong>.
          </p>
        </Callout>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Go to <strong>Settings</strong> → <strong>Grant Access</strong>.</li>
          <li>
            Paste addresses into the big box, <strong>one per line</strong>. They must end in{' '}
            <Mono>@{ALLOWED_EMAIL_DOMAIN}</Mono> — anything else is skipped with a yellow warning,
            which usually means a typo.
          </li>
          <li>
            Pick their <strong>Site</strong> and <strong>Roles</strong>, then click{' '}
            <strong>Add Person</strong>.
          </li>
        </ol>
        <Expect>a short list confirming &ldquo;Added 3 of 3&rdquo;, with a green tick per address.</Expect>
        <p>
          They appear below as <strong className="text-amber-600">Pending first sign-in</strong>{' '}
          until they actually log in, then <strong className="text-green-600">Active</strong>.
        </p>

        <Table>
          <thead><Row header cells={['Role', 'What they can do']} /></thead>
          <tbody>
            <Row cells={[<strong key="b">Broker</strong>, 'The default. Their own clients and loads, nothing they do not own.']} />
            <Row cells={[<strong key="a">Admin</strong>, 'Sees every record, and can manage who has access.']} />
            <Row cells={[<strong key="d">Dispatcher</strong>, 'Can send carrier and shipper agreements.']} />
            <Row cells={[<strong key="f">Finance</strong>, 'Can generate BOLs and invoices.']} />
          </tbody>
        </Table>
        <p>
          Everyone is a Broker unless given something else. Clicking <strong>Broker</strong> takes
          the other roles away. Roles picked at invite time apply to everyone in that batch.
        </p>

        <Table>
          <thead><Row header cells={['', 'What it does', 'Use it when']} /></thead>
          <tbody>
            <Row cells={[
              <strong key="s">Suspend</strong>,
              'Blocks sign-in but keeps their roles. Reversible.',
              'Someone is on leave, or you need to pause access while you check something.',
            ]} />
            <Row cells={[
              <strong key="r">Remove</strong>,
              'Deletes their entry completely.',
              'Someone has left the company.',
            ]} />
          </tbody>
        </Table>

        <Callout tone="caution" title="One thing to know about removing someone">
          <p>
            They lose access to records immediately. But a file they already had open — a PDF, a
            scanned document — may still download for <strong>up to one hour</strong> afterwards.
            That is expected. If it matters urgently, have them sign out, or wait the hour.
          </p>
        </Callout>
      </>
    ),
  },

  {
    id: 'imports',
    title: 'Importing data from BATS',
    subtitle: 'Drag-and-drop, in Settings — no commands needed',
    body: (
      <>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Export from BATS as CSV. You should get files named like{' '}
            <Mono>carriers-export-….csv</Mono>, <Mono>customers-export-….csv</Mono> and{' '}
            <Mono>orders-export-….csv</Mono>
          </li>
          <li>Go to <strong>Settings</strong> → <strong>BATS Data Import</strong>.</li>
          <li>Drag each file into its matching box. Several order files at once is fine.</li>
          <li>Click <strong>Run Import</strong>.</li>
        </ol>
        <Expect>
          a result line per type, like &ldquo;Carriers — 12 written · 480 unchanged · 492 total&rdquo;.
        </Expect>
        <Callout tone="good" title="Re-importing is safe">
          <p>
            TTMS remembers each row and skips anything unchanged, so a fresh export next week only
            writes what is genuinely new. You will not create duplicates.
          </p>
        </Callout>
        <p>
          Also on Settings: <strong>Sites</strong> (company locations) and{' '}
          <strong>Work Groups</strong> (teams that share client records). Both are simple
          add-and-name lists.
        </p>
      </>
    ),
  },

  {
    id: 'trouble',
    title: 'When something goes wrong',
    subtitle: 'What it means, and when to stop and call for help',
    body: (
      <Table>
        <thead><Row header cells={['What you see', 'What it means', 'What to do']} /></thead>
        <tbody>
          <Row cells={[
            <>&ldquo;This site can&rsquo;t be reached&rdquo;</>,
            'TTMS is not running.',
            <>Double-click <strong>Start TTMS</strong>, wait 10 seconds.</>,
          ]} />
          <Row cells={[
            'The dark window flashed up and vanished',
            'It hit a problem and closed too fast to read.',
            <>Right-click <Mono>start-ttms.bat</Mono> → <strong>Open in Terminal</strong>. The message stays on screen.</>,
          ]} />
          <Row cells={[
            <>&ldquo;Node.js is not installed&rdquo;</>,
            'Setup step 1 did not finish, or the restart was skipped.',
            'Redo step 1, including restarting the computer.',
          ]} />
          <Row cells={[
            <>&ldquo;the settings file is missing&rdquo;</>,
            <><Mono>.env.local</Mono> is absent or misnamed.</>,
            'Redo setup step 4. Check the .txt trap.',
          ]} />
          <Row cells={[
            <>&ldquo;port 3000 is in use&rdquo;</>,
            'TTMS is already running in another window.',
            'Find the other dark window on the taskbar and use that one.',
          ]} />
          <Row cells={[
            'Someone signs in and is instantly signed back out',
            'Their email is not on the access list.',
            'Add them under Settings → Grant Access.',
          ]} />
          <Row cells={[
            <>&ldquo;Missing or insufficient permissions&rdquo;</>,
            'A security settings change has not been published to Google.',
            <><strong>Call for help.</strong> A developer must run the rules deploy.</>,
          ]} />
          <Row cells={[
            'Nobody in the company can sign in',
            'Something has gone wrong with the access list.',
            <><strong>Call for help immediately.</strong> Sign in with a bootstrap admin address.</>,
          ]} />
          <Row cells={[
            'Agreement emails are not arriving',
            'The email key expired, or the sending domain lost verification.',
            <>Check junk first, then <strong>call for help</strong>.</>,
          ]} />
          <Row cells={[
            <>A signing link sent to a carrier points at &ldquo;localhost&rdquo;</>,
            'Expected until TTMS is properly deployed.',
            <>The carrier cannot use it. <strong>Call for help.</strong></>,
          ]} />
        </tbody>
      </Table>
    ),
  },

  {
    id: 'never',
    title: 'Things you must never do',
    subtitle: 'Short list — every one of these has bitten somebody',
    body: (
      <ul className="space-y-2">
        {[
          <>
            <strong>Never post the <Mono>.env.local</Mono> file anywhere</strong> — not email, chat
            or a shared drive. It is the password to all company data.
          </>,
          <>
            <strong>Never delete or demote the bootstrap admin addresses</strong> in Settings. They
            are the emergency way back in.
          </>,
          <><strong>Never delete the <Mono>ttms</Mono> folder</strong> while trying to fix something.</>,
          <>
            <strong>Never run a command a developer has not asked you to run.</strong> Several write
            directly to live company data.
          </>,
          <><strong>Never assume you are on a test copy.</strong> You are not. There is not one.</>,
        ].map((item, i) => (
          <li key={i} className="flex gap-2.5 rounded-lg bg-red-50 px-4 py-3 text-sm text-gray-700">
            <Ban size={15} className="mt-0.5 flex-shrink-0 text-red-600" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    ),
  },
];

// ── Search plumbing ──────────────────────────────────────────────────────────

/**
 * The CSS Custom Highlight API is not in this TypeScript lib yet, and is absent
 * in older browsers. Both are handled by feature-detecting through a narrow
 * shim rather than asserting the globals exist.
 */
interface HighlightRegistry {
  set(name: string, highlight: object): void;
  delete(name: string): void;
}
type HighlightCtor = new (...ranges: Range[]) => object;

/**
 * The highlight colours are injected at runtime rather than living in
 * globals.css: Turbopack's CSS parser does not recognise the `::highlight()`
 * pseudo-element and silently drops the rules from the build, so the tint
 * never paints. The browser parses this fine at runtime, and one that lacks
 * the API just ignores it.
 */
const HIGHLIGHT_CSS = `
::highlight(handbook-search) { background-color: #fde68a; color: #111827; }
::highlight(handbook-search-current) { background-color: #f59e0b; color: #111827; }
`;

function highlightApi(): { registry: HighlightRegistry; Ctor: HighlightCtor } | null {
  if (typeof window === 'undefined') return null;
  const css = (window as unknown as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  const Ctor = (window as unknown as { Highlight?: HighlightCtor }).Highlight;
  if (!css?.highlights || !Ctor) return null;
  return { registry: css.highlights, Ctor };
}

/** Every occurrence of `needle` in visible text under `root`, in document order. */
function findRanges(root: HTMLElement, needle: string): Range[] {
  const out: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const parent = node.parentElement;
    // Collapsed chapters stay mounted so their text is searchable, but a range
    // inside one cannot be scrolled to or painted — skip until it is opened.
    if (parent && !parent.closest('[hidden]') && !parent.closest('[data-no-search]')) {
      const haystack = (node.nodeValue ?? '').toLowerCase();
      let i = haystack.indexOf(needle);
      while (i !== -1) {
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + needle.length);
        out.push(range);
        i = haystack.indexOf(needle, i + needle.length);
      }
    }
    node = walker.nextNode();
  }
  return out;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function HandbookPage() {
  const { isAdmin, loading } = useAuth();
  const router = useRouter();

  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(['accounts']));
  const [indexOpen, setIndexOpen] = useState(false);

  const [rawQuery, setRawQuery] = useState('');
  const [query, setQuery] = useState('');
  const [hitCount, setHitCount] = useState(0);
  const [hitIndex, setHitIndex] = useState(0);

  const contentRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const rangesRef = useRef<Range[]>([]);
  const pendingScroll = useRef<string | null>(null);

  // Hiding the nav link is not access control — someone can type the URL. This
  // matches the guard on Settings.
  useEffect(() => {
    if (!loading && !isAdmin) router.replace('/dashboard');
  }, [isAdmin, loading, router]);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = HIGHLIGHT_CSS;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  const toggle = useCallback((id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  /** Index click: open the chapter, then scroll to it once it has rendered. */
  const jumpTo = useCallback((id: string) => {
    setOpenIds((prev) => new Set(prev).add(id));
    pendingScroll.current = id;
    setIndexOpen(false);
  }, []);

  useEffect(() => {
    const id = pendingScroll.current;
    if (!id) return;
    pendingScroll.current = null;
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // Debounce so highlighting does not rerun on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(rawQuery.trim().toLowerCase()), 150);
    return () => clearTimeout(t);
  }, [rawQuery]);

  // A hit inside a collapsed chapter is invisible and unscrollable, so open
  // every chapter whose text contains the query before painting.
  useEffect(() => {
    if (query.length < MIN_QUERY) return;
    const matched = CHAPTERS
      .filter((c) => (document.getElementById(c.id)?.textContent ?? '').toLowerCase().includes(query))
      .map((c) => c.id);
    if (matched.length === 0) return;
    setOpenIds((prev) => {
      if (matched.every((id) => prev.has(id))) return prev; // no-op keeps this effect stable
      return new Set([...prev, ...matched]);
    });
  }, [query]);

  useEffect(() => { setHitIndex(0); }, [query]);

  // Paint the hits. Runs after chapters open, so ranges land on visible text.
  useEffect(() => {
    const api = highlightApi();
    api?.registry.delete('handbook-search');
    api?.registry.delete('handbook-search-current');

    const root = contentRef.current;
    if (!root || query.length < MIN_QUERY) {
      rangesRef.current = [];
      setHitCount(0);
      return;
    }

    const ranges = findRanges(root, query);
    rangesRef.current = ranges;
    setHitCount(ranges.length);

    if (api && ranges.length > 0) {
      const current = ranges[Math.min(hitIndex, ranges.length - 1)];
      const rest = ranges.filter((r) => r !== current);
      if (rest.length > 0) api.registry.set('handbook-search', new api.Ctor(...rest));
      api.registry.set('handbook-search-current', new api.Ctor(current));
    }

    return () => {
      api?.registry.delete('handbook-search');
      api?.registry.delete('handbook-search-current');
    };
  }, [query, openIds, hitIndex]);

  // Scroll the active hit into view.
  useEffect(() => {
    const range = rangesRef.current[hitIndex];
    if (!range) return;
    const target = range.startContainer.parentElement;
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [hitIndex, hitCount, query]);

  const step = useCallback((delta: number) => {
    setHitIndex((i) => {
      const n = rangesRef.current.length;
      if (n === 0) return 0;
      return (i + delta + n) % n;
    });
  }, []);

  // Close the index when clicking elsewhere.
  useEffect(() => {
    if (!indexOpen) return;
    function onDown(e: MouseEvent) {
      if (!indexRef.current?.contains(e.target as Node)) setIndexOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [indexOpen]);

  const allOpen = useMemo(() => CHAPTERS.every((c) => openIds.has(c.id)), [openIds]);

  if (loading || !isAdmin) return null;

  const searching = query.length >= MIN_QUERY;

  return (
    <div className="max-w-4xl p-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-gray-900">
          <BookOpen size={24} className="text-brand-500" />
          Admin Handbook
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">
          How to administer and maintain TTMS. Visible to admins only.
        </p>
      </div>

      {/* Toolbar. Sticks to the top of the scrolling area so search and the
          index stay reachable from anywhere in a long page. */}
      <div
        data-no-search
        className="sticky top-0 z-20 -mx-8 mb-5 border-b border-gray-200 bg-gray-50/95 px-8 py-3 backdrop-blur"
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              value={rawQuery}
              onChange={(e) => setRawQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
                if (e.key === 'Escape') { setRawQuery(''); searchRef.current?.blur(); }
              }}
              placeholder="Search the handbook…"
              spellCheck={false}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-8 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {rawQuery && (
              <button
                type="button"
                onClick={() => { setRawQuery(''); searchRef.current?.focus(); }}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {searching && (
            <div className="flex items-center gap-1">
              <span className="tabular-nums px-1 text-xs font-medium text-gray-500">
                {hitCount === 0 ? 'No matches' : `${hitIndex + 1} of ${hitCount}`}
              </span>
              <button
                type="button"
                onClick={() => step(-1)}
                disabled={hitCount === 0}
                aria-label="Previous match"
                className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 transition hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                disabled={hitCount === 0}
                aria-label="Next match"
                className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 transition hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronDown size={14} />
              </button>
            </div>
          )}

          <div className="relative" ref={indexRef}>
            <button
              type="button"
              onClick={() => setIndexOpen((v) => !v)}
              aria-expanded={indexOpen}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              <List size={15} />
              Contents
              <ChevronDown size={13} className={`transition-transform ${indexOpen ? 'rotate-180' : ''}`} />
            </button>

            {indexOpen && (
              <div className="absolute right-0 z-30 mt-1.5 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                <ol className="max-h-80 overflow-y-auto py-1">
                  {CHAPTERS.map((c, i) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => jumpTo(c.id)}
                        className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition hover:bg-gray-50"
                      >
                        <span className="mt-0.5 font-mono text-[11px] tabular-nums text-gray-400">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-gray-800">{c.title}</span>
                          <span className="block text-xs text-gray-500">{c.subtitle}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
                <button
                  type="button"
                  onClick={() =>
                    setOpenIds(allOpen ? new Set() : new Set(CHAPTERS.map((c) => c.id)))
                  }
                  className="w-full border-t border-gray-100 px-3 py-2 text-left text-xs font-medium text-brand-500 transition hover:bg-gray-50"
                >
                  {allOpen ? 'Collapse all sections' : 'Expand all sections'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <Callout tone="critical" title="TTMS is not on the internet yet">
          <p>
            TTMS <strong>only runs on the one computer you start it on.</strong> Nobody else in the
            company can open it, and you cannot reach it from your phone or from home.
          </p>
          <p>
            <strong>But the data is real and shared.</strong> The orders, carriers and clients you
            see are the live company records. Anything you change is changed for good, immediately.
            There is no practice mode and no undo.
          </p>
          <p>
            Putting TTMS on a real web address is the biggest outstanding job on this project. It
            needs a developer — see <Mono>docs/admin-handbook.md</Mono> in the repository.
          </p>
        </Callout>
      </div>

      <JumpContext.Provider value={jumpTo}>
        <div ref={contentRef} className="space-y-3">
          {CHAPTERS.map((c, i) => {
            const open = openIds.has(c.id);
            return (
              <section
                key={c.id}
                id={c.id}
                className="scroll-mt-20 overflow-hidden rounded-xl border border-gray-200 bg-white"
              >
                <button
                  type="button"
                  onClick={() => toggle(c.id)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-3 px-6 py-4 text-left transition hover:bg-gray-50"
                >
                  <span
                    data-no-search
                    className="font-mono text-[11px] tabular-nums text-gray-400"
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-900">{c.title}</span>
                    <span className="mt-0.5 block text-xs text-gray-500">{c.subtitle}</span>
                  </span>
                  <ChevronDown
                    size={16}
                    className={`flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
                  />
                </button>
                {/* Kept mounted while collapsed so search can still find it. */}
                <div hidden={!open} className="space-y-4 border-t border-gray-100 px-6 py-5">
                  {c.body}
                </div>
              </section>
            );
          })}
        </div>
      </JumpContext.Provider>

      {/* ── For developers ─────────────────────────────────────────────── */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 px-6 py-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <KeyRound size={15} className="text-gray-400" />
          For whoever maintains the code
        </h2>
        <p className="mt-1.5 text-sm text-gray-600">
          The technical half — architecture, the security rules deploy, the maintenance scripts, the
          data model and the outstanding deployment work — lives with the code, where it stays in
          step with what it describes.
        </p>
        <ul className="mt-3 space-y-1 text-sm text-gray-600">
          <li><Mono>docs/admin-handbook.md</Mono> — the full handbook, all three parts</li>
          <li><Mono>docs/schema-guide.md</Mono> — the data model</li>
          <li><Mono>CLAUDE.md</Mono> — context for AI-assisted work</li>
        </ul>
        <a
          href={REPO}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm font-medium text-brand-500 transition hover:text-brand-600 hover:underline"
        >
          Open the repository →
        </a>
      </div>
    </div>
  );
}
