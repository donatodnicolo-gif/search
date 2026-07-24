import type { Metadata } from 'next'
import './tokens.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'Deluxy Messaggi',
  description:
    'Inbox unificata Deluxy: WhatsApp, Messenger e Instagram in un posto solo, più la chat del sito.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  )
}
