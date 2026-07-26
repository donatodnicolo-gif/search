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
