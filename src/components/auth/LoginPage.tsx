'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
  const { signInWithGoogle, loading } = useAuth();
  const searchParams                  = useSearchParams();
  const [error, setError]             = useState<string | null>(null);
  const [signingIn, setSigningIn]     = useState(false);

  useEffect(() => {
    if (searchParams.get('error') === 'unauthorized_domain') {
      setError('Access denied. Only @totaltransportlogistics.us accounts are permitted.');
    }
  }, [searchParams]);

  const handleSignIn = async () => {
    setError(null);
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign-in failed. Please try again.';
      setError(message);
    } finally {
      setSigningIn(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-900">
        <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-brand-900 via-brand-700 to-brand-600 px-4">
      {/* Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">

        {/* Header stripe */}
        <div className="bg-brand-900 px-8 py-6 flex flex-col items-center gap-3">
          <Image src="/logo-circle.png" alt="Total Transport Logistics" width={88} height={88} className="rounded-full shadow-lg" />
          <h1 className="text-white text-xl font-bold tracking-wide">Total Transport Logistics</h1>
          <p className="text-blue-200 text-sm">Transportation Management System</p>
        </div>

        {/* Body */}
        <div className="px-8 py-8 flex flex-col gap-5">
          <div className="text-center">
            <h2 className="text-gray-800 text-lg font-semibold">Welcome back</h2>
            <p className="text-gray-500 text-sm mt-1">Sign in with your company Google account to continue</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <button
            onClick={handleSignIn}
            disabled={signingIn}
            className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 rounded-lg px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {signingIn ? (
              <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              /* Google G logo */
              <svg className="w-5 h-5" viewBox="0 0 48 48">
                <path fill="#4285F4" d="M44.5 20H24v8.5h11.8C34.7 33.9 29.9 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/>
                <path fill="#34A853" d="M6.3 14.7l7 5.1C15.1 16.1 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 16.3 2 9.6 7.3 6.3 14.7z"/>
                <path fill="#FBBC05" d="M24 46c5.8 0 10.7-1.9 14.3-5.2l-6.6-5.4C29.9 37 27.1 38 24 38c-5.8 0-10.7-3.9-12.4-9.2l-7 5.4C7.9 41.5 15.3 46 24 46z"/>
                <path fill="#EA4335" d="M44.5 20H24v8.5h11.8c-.8 2.3-2.3 4.3-4.3 5.8l6.6 5.4C42.3 36.4 45 30.8 45 24c0-1.3-.2-2.7-.5-4z"/>
              </svg>
            )}
            {signingIn ? 'Signing in…' : 'Continue with Google'}
          </button>

          <p className="text-center text-xs text-gray-400">
            Access restricted to <span className="font-medium text-gray-600">@totaltransportlogistics.us</span> accounts only
          </p>
        </div>
      </div>

      <p className="mt-6 text-blue-200 text-xs">© {new Date().getFullYear()} Total Transport Logistics · Internal Use Only</p>
    </div>
  );
}
