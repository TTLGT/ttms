import type { Metadata } from 'next';
import { Rajdhani } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';

const rajdhani = Rajdhani({ weight: '700', subsets: ['latin'], variable: '--font-rajdhani' });

export const metadata: Metadata = {
  title: 'TTL TMS — Total Transport Logistics',
  description: 'Internal Transportation Management System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={rajdhani.variable}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
