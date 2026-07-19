import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Sidebar } from '@/components/Sidebar'
import { Shell } from '@/components/Shell'
import { utenteCorrente } from '@/lib/sessione'

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

// Le azioni AI (analisi, riassunti) possono richiedere qualche decina di
// secondi, coi retry inclusi. Su Vercel il default è 10s: lo alziamo a 60 così
// non vengono troncate a metà con un errore di connessione.
export const maxDuration = 60

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Se c'è un utente mostriamo la sidebar (e su mobile l'hamburger); sul login
  // no: contenuto a tutta pagina.
  const utente = await utenteCorrente()
  return (
    <html lang="it">
      <body>
        <Shell mostraNav={!!utente} sidebar={utente ? <Sidebar /> : null}>
          {children}
        </Shell>
      </body>
    </html>
  )
}
