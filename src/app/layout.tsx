import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { THEME_BOOT_SCRIPT } from '@/lib/themeBoot';

// From src/fonts rather than next/font/google, which downloads at build time
// and broke Vercel deploys — see src/components/tasks/themeFonts.ts.
const rajdhani = localFont({ src: '../fonts/rajdhani-700.woff2', weight: '700', variable: '--font-rajdhani' });

export const metadata: Metadata = {
  title: 'TTL TMS — Total Transport Logistics',
  description: 'Internal Transportation Management System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the boot script may add `dark` to this element
    // before React hydrates it, and that difference is the point, not a fault.
    <html lang="en" className={rajdhani.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
