import { redirect } from 'next/navigation';

// Root always bounces to the dashboard; middleware handles unauthenticated redirect to /login
export default function RootPage() {
  redirect('/dashboard');
}
