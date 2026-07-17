import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Sidebar } from '@/components/Sidebar'

export const metadata: Metadata = {
  title: 'AI Mail — Deluxy',
  description: 'Client di posta che smista, crea attività e propone risposte in automatico',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'AI Mail', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  themeColor: '#f5f5f7',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>
        <div className="shell">
          <Sidebar />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  )
}
