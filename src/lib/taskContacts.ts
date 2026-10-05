'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { listDirectory, type DirectoryPerson } from './directory';

/**
 * The company directory, for the contacts on somebody's own tasks — see
 * `TaskContact` in src/types/task.ts.
 *
 * The same `listDirectory()` the phone book uses, so a task shows exactly what
 * the phone book would show this person and nothing more: an admin or HR sees
 * the people not signed in yet, everyone else sees signed-in colleagues only.
 *
 * Loaded only once `wanted` turns true — the editor is open, or some task
 * already names somebody — and then kept for the visit. It is one read per
 * colleague, which is cheap, but a to-do list nobody has added a contact to
 * should not pay it on every visit.
 *
 * Keyed by lower-cased email, which is how a task stores its contacts.
 */
export function useTaskDirectory(wanted: boolean): {
  people: Map<string, DirectoryPerson> | null;
  error: string;
} {
  const { profile } = useAuth();
  const [people, setPeople] = useState<Map<string, DirectoryPerson> | null>(null);
  const [error, setError] = useState('');
  const ready = !!profile;

  useEffect(() => {
    // `ready` rather than `profile`: the profile object is replaced on every
    // live update of the signed-in user, and nothing on a task card is worth
    // reading the whole directory again for.
    if (!wanted || !ready || people) return;
    let live = true;
    listDirectory(profile)
      .then((list) => {
        if (live) setPeople(new Map(list.map((p) => [p.email.toLowerCase(), p])));
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : 'Could not load the directory.');
      });
    return () => { live = false; };
  }, [wanted, ready, people, profile]);

  return { people, error };
}
