import type { Metadata } from 'next';
import { Rajdhani } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { THEME_BOOT_SCRIPT } from '@/lib/themeBoot';

const rajdhani = Rajdhani({ weight: '700', subsets: ['latin'], variable: '--font-rajdhani' });

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
