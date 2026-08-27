import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Sidebar } from '@/components/Sidebar'
import { Shell } from '@/components/Shell'
import { Flash } from '@/components/Flash'
import { InvioAppDialog } from '@/components/InvioAppDialog'
import { Scorciatoie } from '@/components/Scorciatoie'
import { descriviAzioni } from '@/lib/appDeluxy'
import { leggiChiaviApp } from '@/lib/chiaviApp'
import { utenteCorrente } from '@/lib/sessione'

export const metadata: Metadata = {
  title: 'AI Mail — Deluxy',
  description: 'Client di posta che smista, crea attività e propone risposte in automatico',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'AI Mail', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  // ⚠️ Senza `viewportFit: 'cover'`, `env(safe-area-inset-*)` vale ZERO su iOS —
  // e il CSS lo usa in quattro punti (barra azioni fissa, distanziatore, FAB,
  // menu «⋯ Altro»). Erano quattro calcoli che non calcolavano niente, e nella
  // PWA installata la barra delle azioni finiva sotto la barra Home.
  viewportFit: 'cover',
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
  // Il dialogo APP DELUXY sta QUI, non nelle singole pagine: si apre con
  // l'evento `aimail:app`, che oggi lo lanciano il tasto «→ App», le carte del
  // pannello e lo spostamento in una sezione collegata a un'app — cioè da
  // pagine diverse. Montato in una pagina sola, sarebbe una funzione che
  // esiste solo lì (già successo: dalla mail aperta non si poteva mandare
  // niente a nessuna app). `leggiChiaviApp` è in cache 5 minuti.
  const azioniApp = utente ? descriviAzioni(await leggiChiaviApp()) : []
  return (
    <html lang="it">
      <body>
        <Flash />
        <Shell mostraNav={!!utente} sidebar={utente ? <Sidebar /> : null}>
          {children}
        </Shell>
        {utente && <InvioAppDialog azioni={azioniApp} />}
        {/* Le scorciatoie stanno qui perché valgono ovunque; quelle che
            riguardano una mail si accendono da sole sulla sua pagina. */}
        {utente && <Scorciatoie />}
      </body>
    </html>
  )
}
