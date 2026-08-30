'use client';

import { useEffect, useState } from 'react';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from './firebase';

/**
 * A storage path resolved to a URL that can actually be put in a `src`.
 *
 * Records keep the path, never the URL: a download URL carries a token that can
 * be regenerated, so a stored one goes stale. The trade is that every render
 * needs a lookup, which is what the cache below is for — a thread redraws on
 * every keystroke in the composer, and a fetch per image per keystroke would be
 * both slow and pointless.
 *
 * The cache lives for the session. A file replaced at the same path would show
 * stale until reload, which cannot happen here: chat attachments are written
 * once to a path with a random id in it and never overwritten.
 */
const urlCache = new Map<string, string>();

export function useStorageUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => (path ? urlCache.get(path) ?? null : null));

  useEffect(() => {
    if (!path) { setUrl(null); return; }

    const cached = urlCache.get(path);
    if (cached) { setUrl(cached); return; }

    let live = true;
    getDownloadURL(ref(storage, path))
      .then((resolved) => {
        urlCache.set(path, resolved);
        if (live) setUrl(resolved);
      })
      // A missing file just renders as a broken attachment rather than taking
      // the thread down with it.
      .catch(() => {});

    return () => { live = false; };
  }, [path]);

  return url;
}
