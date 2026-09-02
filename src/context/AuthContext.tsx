'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { auth, googleProvider } from '@/lib/firebase';
import type { UserProfile } from '@/types/userProfile';
import { can as canDo } from '@/lib/accessControl';
import type { Permission } from '@/types/permission';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  /**
   * Whether the signed-in user holds a permission.
   *
   * The one question the UI should ask about ability. Everything below it —
   * which nav items appear, which buttons are drawn — goes through this rather
   * than testing a role, so that giving somebody a single permission lights up
   * exactly the thing it names and nothing else.
   *
   * Reads the effective list off the profile, which is the same array the
   * security rules read. A screen and a rule can still disagree — the screen is
   * a courtesy and the rule is the enforcement — but they are now disagreeing
   * about one list rather than about two derivations of it.
   */
  can: (permission: Permission) => boolean;
  isAdmin: boolean;
  /**
   * Read-only access to the people directory, and nothing else. Kept separate
   * from `isAdmin` rather than folded into it: HR must never light up an admin
   * control just because both roles can open the same page.
   */
  isHr: boolean;
  /**
   * Dispatch. Surfaced because ownership of orders and clients is theirs to
   * change alongside admins — see /api/orders/[orderId]/owners — and the UI
   * has to know whether to offer the control at all.
   */
  isDispatcher: boolean;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** `reason` is the server's machine-readable code, mapped to copy on /login. */
class AccessDeniedError extends Error {
  constructor(message: string, readonly reason: string = 'not_invited') {
    super(message);
  }
}

/**
 * Hands the fresh ID token to the server, which is the authority on whether
 * this account is allowed in. Authenticating with Google is not enough — an
 * admin must have added the address to the allowlist first.
 */
async function establishSession(firebaseUser: User): Promise<UserProfile> {
  const idToken = await firebaseUser.getIdToken();
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 403) {
    throw new AccessDeniedError(
      data.message || 'This account does not have access to TTMS.',
      data.error === 'suspended' ? 'suspended' : 'not_invited',
    );
  }
  if (!res.ok) {
    throw new Error(data.error || 'Could not verify your access. Please try again.');
  }

  // The server may have just set custom claims; refresh so Storage rules see them.
  await firebaseUser.getIdToken(true);
  return data.profile as UserProfile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router                = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const p = await establishSession(firebaseUser);
        setUser(firebaseUser);
        setProfile(p);
      } catch (err) {
        // Any failure to establish access ends the session — never fall through
        // to a signed-in state without a verified allowlist entry.
        await signOut(auth);
        setUser(null);
        setProfile(null);
        const reason = err instanceof AccessDeniedError ? err.reason : 'session_failed';
        router.replace(`/login?error=${reason}`);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const signInWithGoogle = async () => {
    const result = await signInWithPopup(auth, googleProvider);

    try {
      await establishSession(result.user);
    } catch (err) {
      await signOut(auth);
      throw new Error(
        err instanceof AccessDeniedError
          ? err.message
          : 'Could not verify your access. Please try again.',
      );
    }

    router.push('/dashboard');
  };

  const logout = async () => {
    await signOut(auth);
    router.push('/login');
  };

  const isAdmin = profile?.isAdmin ?? false;
  const isHr    = profile?.isHr ?? false;
  const isDispatcher = profile?.isDispatcher ?? false;

  // Rebuilt only when the profile object changes, which is once per sign-in:
  // this is called several times per render by the nav alone.
  const can = useCallback(
    (permission: Permission) => canDo(profile, permission),
    [profile],
  );

  return (
    <AuthContext.Provider value={{ user, profile, can, isAdmin, isHr, isDispatcher, loading, signInWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
