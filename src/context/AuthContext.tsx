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

const ALLOWED_DOMAIN = 'totaltransportlogistics.us';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router                = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const email = firebaseUser.email ?? '';

        if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
          // Hard reject — sign out immediately and surface an error in console
          console.warn(
            `[Auth] Unauthorized domain rejected: ${email}. ` +
            `Only @${ALLOWED_DOMAIN} accounts are permitted.`
          );
          await signOut(auth);
          setUser(null);
          setLoading(false);
          router.replace('/login?error=unauthorized_domain');
          return;
        }

        setUser(firebaseUser);
      } else {
        setUser(null);
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

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
