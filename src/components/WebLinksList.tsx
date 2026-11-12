'use client';

import { ExternalLink, Globe, MapPin, Share2 } from 'lucide-react';
import { WEB_LINK_LABEL, safeWebUrl, webLinkText, type WebLink } from '@/types/webLinks';

/**
 * A record's website and social links, drawn as links that open in a new
 * tab. Every address goes through safeWebUrl() again here, not only on save:
 * a document edited by hand in the Console never went through the route, and
 * an unchecked `href` is a script waiting for a colleague's click.
 *
 * Plain icons, no brand logos — the icon set has none, and a label says which
 * network it is just as well.
 */
export default function WebLinksList({ links, compact = false, empty = '—' }: {
  links: readonly WebLink[];
  /** One line per link with just the label, for a rail card. */
  compact?: boolean;
  empty?: React.ReactNode;
}) {
  const safe = links.flatMap((l) => {
    const href = safeWebUrl(l.url);
    return href ? [{ ...l, href }] : [];
  });
  if (!safe.length) return <>{empty}</>;

  return (
    <ul className={compact ? 'space-y-1' : 'space-y-1.5'}>
      {safe.map((l) => {
        const Icon = l.kind === 'website' ? Globe : l.kind === 'google' ? MapPin : Share2;
        return (
          <li key={l.href} className="min-w-0">
            <a href={l.href} target="_blank" rel="noopener noreferrer" title={l.href}
              className="group inline-flex max-w-full items-center gap-1.5 text-sm text-brand-700 hover:underline">
              <Icon className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
              {l.kind !== 'website' && l.kind !== 'other' && (
                <span className="shrink-0 font-medium">{WEB_LINK_LABEL[l.kind]}</span>
              )}
              {(!compact || l.kind === 'website' || l.kind === 'other') && (
                <span className={`truncate ${l.kind !== 'website' && l.kind !== 'other' ? 'text-gray-500' : ''}`}>
                  {webLinkText(l.href)}
                </span>
              )}
              <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-60" aria-hidden />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
