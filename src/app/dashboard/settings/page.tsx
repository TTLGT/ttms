'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listUserProfiles, setUserAdmin } from '@/lib/userProfiles';
import { useAuth } from '@/context/AuthContext';
import type { UserProfile } from '@/types/userProfile';
import BatsImportPanel from '@/components/settings/BatsImportPanel';

export default function SettingsPage() {
  const { user, isAdmin }        = useAuth();
  const router                   = useRouter();
  const [users, setUsers]        = useState<UserProfile[]>([]);
  const [loading, setLoading]    = useState(true);
  const [error, setError]        = useState('');
  const [toggling, setToggling]  = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      router.replace('/dashboard');
      return;
    }
    listUserProfiles()
      .then((profiles) =>
        setUsers(profiles.sort((a, b) => a.email.localeCompare(b.email)))
      )
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [isAdmin, router]);

  async function handleToggle(profile: UserProfile) {
    if (profile.uid === user?.uid) return; // can't remove your own admin
    setToggling(profile.uid);
    try {
      await setUserAdmin(profile.uid, !profile.isAdmin);
      setUsers((prev) =>
        prev.map((u) => u.uid === profile.uid ? { ...u, isAdmin: !u.isAdmin } : u)
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage team access and permissions</p>
      </div>

      <section className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Team Members</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Admins can see all records and manage access. Regular users only see records assigned to them.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="m-6 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600">{error}</div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            No users yet. Users appear here after their first sign-in.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {users.map((u) => {
              const isSelf     = u.uid === user?.uid;
              const isToggling = toggling === u.uid;
              return (
                <li key={u.uid} className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold text-sm">
                      {(u.displayName || u.email).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {u.displayName || '—'}
                        {isSelf && <span className="ml-1.5 text-xs text-gray-400">(you)</span>}
                      </p>
                      <p className="text-xs text-gray-500">{u.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                      u.isAdmin
                        ? 'bg-brand-50 text-brand-700 border border-brand-200'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {u.isAdmin ? 'Admin' : 'User'}
                    </span>

                    <button
                      onClick={() => handleToggle(u)}
                      disabled={isSelf || isToggling}
                      title={isSelf ? "You can't change your own role" : undefined}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                        isSelf
                          ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                          : u.isAdmin
                          ? 'border-red-200 text-red-600 hover:bg-red-50'
                          : 'border-brand-200 text-brand-600 hover:bg-brand-50'
                      }`}
                    >
                      {isToggling ? '…' : u.isAdmin ? 'Remove Admin' : 'Make Admin'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="mt-4 text-xs text-gray-400">
        Users appear in this list after signing in for the first time.
      </p>

      <BatsImportPanel />
    </div>
  );
}
