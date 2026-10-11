import type { Metadata } from 'next';
import { Geist_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import { ThemeProvider } from '@/providers/theme-provider';
import './globals.css';

// Open Runde, a rounded sans by Laurids Kern (SIL Open Font License 1.1),
// the same face as the VibeCut editor
const openRunde = localFont({
  src: [
    { path: './fonts/OpenRunde-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/OpenRunde-Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/OpenRunde-Semibold.woff2', weight: '600', style: 'normal' },
    { path: './fonts/OpenRunde-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-open-runde',
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'ISO Video - Isometric Website Video Generator',
  description: 'Transform website screenshots into stunning isometric videos with cinematic 3D effects',
  keywords: ['video generator', 'website screenshot', 'isometric', '3D video', 'product demo'],
  authors: [{ name: 'Sethi HQ' }],
  openGraph: {
    title: 'ISO Video - Isometric Website Video Generator',
    description: 'Transform website screenshots into stunning isometric videos with cinematic 3D effects',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ISO Video - Isometric Website Video Generator',
    description: 'Transform website screenshots into stunning isometric videos with cinematic 3D effects',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${openRunde.variable} ${geistMono.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
