import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ClientShell } from '@/components/ClientShell'
import { getLocale } from '@/lib/i18n/get-locale'
import { DEFAULT_LANGUAGE, type Locale } from '@/lib/i18n'

export const metadata: Metadata = {
  title: 'AnyCash',
  description: 'Privacy-first personal finance',
  applicationName: 'AnyCash',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.svg',
    apple: '/logo-appicon.svg',
  },
  appleWebApp: {
    capable: true,
    title: 'AnyCash',
    statusBarStyle: 'default',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAFAF8' },
    { media: '(prefers-color-scheme: dark)', color: '#14171A' },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const initialLocale: Locale = await getLocale()

  return (
    <html lang={initialLocale} suppressHydrationWarning>
      <body className="antialiased min-h-screen">
        <ClientShell initialLocale={initialLocale}>{children}</ClientShell>
      </body>
    </html>
  )
}
