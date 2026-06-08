import { Suspense } from 'react';
import LoginPage from '@/components/auth/LoginPage';

export const metadata = { title: 'Sign In — TTL TMS' };

export default function LoginRoute() {
  return (
    // Suspense required because LoginPage uses useSearchParams()
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}
