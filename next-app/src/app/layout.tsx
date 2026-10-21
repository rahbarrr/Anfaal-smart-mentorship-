import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './theme.css';
import './legacy-index.css';
import './login/LoginPage.css';
import './mentee/MenteeDashboardPage.css';
import './mentee/daily/DailyPerformanceFormPage.css';
import './globals.css';


import { ClientProviders } from '@/components/ClientProviders';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Anfaal Smart Mentorship',
  description: 'Anfaal Mentorship Management Platform for mentoring call tracking, AI summaries, and mentorship operations.',
  applicationName: 'Anfaal',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Anfaal',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#8f3f66',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </head>
      <body>
        <div id="root">
          <ClientProviders>
            {children}
          </ClientProviders>
        </div>
      </body>
    </html>
  );
}
