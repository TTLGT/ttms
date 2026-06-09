'use client';

import {
  createContext,
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
import { getOrCreateUserProfile } from '@/lib/userProfiles';
import type { UserProfile } from '@/types/userProfile';

const ALLOWED_DOMAIN = 'totaltransportlogistics.us';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  isAdmin: boolean;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router                = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const email = firebaseUser.email ?? '';

        if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
          console.warn(
            `[Auth] Unauthorized domain rejected: ${email}. ` +
            `Only @${ALLOWED_DOMAIN} accounts are permitted.`
          );
          await signOut(auth);
          setUser(null);
          setProfile(null);
          setLoading(false);
          router.replace('/login?error=unauthorized_domain');
          return;
        }

        setUser(firebaseUser);
        try {
          const p = await getOrCreateUserProfile(firebaseUser);
          setProfile(p);
        } catch {
          setProfile(null);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  const signInWithGoogle = async () => {
    const result = await signInWithPopup(auth, googleProvider);
    const email  = result.user.email ?? '';

    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      await signOut(auth);
      throw new Error(`Only @${ALLOWED_DOMAIN} accounts are allowed.`);
    }

    router.push('/dashboard');
  };

  const logout = async () => {
    await signOut(auth);
    router.push('/login');
  };

  const isAdmin = profile?.isAdmin ?? false;

  return (
    <AuthContext.Provider value={{ user, profile, isAdmin, loading, signInWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
