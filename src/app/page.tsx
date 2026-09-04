import { redirect } from 'next/navigation';

// Root always bounces to the dashboard. The redirect to /login for a signed-out
// visitor happens there, client-side in dashboard/layout.tsx — there is no
// middleware layer doing it, and there never was.
export default function RootPage() {
  redirect('/dashboard');
}
