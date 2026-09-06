import type { Metadata, Viewport } from 'next'
import './tokens.css'
import './globals.css'

// ⚠️ Senza `viewportFit: 'cover'` ogni `env(safe-area-inset-*)` del CSS vale
// zero (Libro §10.3): il composer della chat, sull'iPhone, finiva sotto la
// barra di casa. Scoperto dall'architetto UX il 06/09/2026.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'Deluxy Customer Service',
  description:
    'Il servizio clienti Deluxy: reclami sugli ordini con casistiche, azioni e giudizi a valet e partner, più la messaggistica unificata (WhatsApp, Messenger, Instagram e chat dei siti).',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: lo script qui sotto scrive data-sidebar-chiusa
    // sull'html prima che React idrati — la differenza è voluta, non un errore.
    <html lang="it" suppressHydrationWarning>
      <head>
        {/* Riapplica la scelta "menu chiuso" prima del primo disegno, così la
            sidebar non compare per un istante per poi sparire. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('messaggi-sidebar')==='chiusa'){document.documentElement.setAttribute('data-sidebar-chiusa','')}}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
