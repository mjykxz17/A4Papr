import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Noto_Sans, Noto_Sans_SC } from 'next/font/google';
import './globals.css';

// Bundled at build time so the worker doesn't depend on the host
// having CJK fonts installed and doesn't need an internet round-trip
// to Google Fonts at render time.
const notoSans = Noto_Sans({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-noto-sans',
  display: 'swap',
});
const notoSansSC = Noto_Sans_SC({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-noto-sans-sc',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  title: 'A4 Papr',
  description: 'Build print-ready exam cheatsheets on an A4 canvas.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${notoSans.variable} ${notoSansSC.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
