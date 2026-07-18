'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  /** HTML già sanitizzato lato server, o null se la mail è di solo testo. */
  html: string | null
  testo: string
}

/**
 * Mostra il corpo di una mail. Se c'è l'HTML lo rende come si deve — tabelle,
 * immagini, formattazione — dentro un iframe in sandbox SENZA script: il codice
 * della mail non può girare, quindi niente XSS né tracciamento attivo. I link
 * si aprono in una scheda nuova. Un interruttore torna al testo semplice.
 *
 * L'iframe è same-origin (via srcdoc) ma senza allow-scripts: così la pagina
 * può misurarne l'altezza per adattarla al contenuto, mentre gli script della
 * mail restano inerti.
 */
export function CorpoMessaggio({ html, testo }: Props) {
  const [modo, setModo] = useState<'html' | 'testo'>(html ? 'html' : 'testo')
  const [altezza, setAltezza] = useState(200)
  const ref = useRef<HTMLIFrameElement>(null)

  const documento = html
    ? `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
        html,body{margin:0;padding:0}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
          font-size:15px;line-height:1.5;color:#1d1d1f;word-break:break-word;overflow-x:hidden}
        img{max-width:100%;height:auto}
        a{color:#0071e3}
        table{max-width:100%}
      </style></head><body>${html}</body></html>`
    : ''

  function misura() {
    const corpo = ref.current?.contentDocument?.body
    if (corpo) setAltezza(Math.min(corpo.scrollHeight + 8, 5000))
  }

  useEffect(() => {
    if (modo === 'html') misura()
  }, [modo])

  return (
    <>
      {html && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button
            type="button"
            className="azione-riga"
            onClick={() => setModo((m) => (m === 'html' ? 'testo' : 'html'))}
          >
            {modo === 'html' ? 'Vedi testo semplice' : 'Vedi versione formattata'}
          </button>
        </div>
      )}

      {modo === 'html' && html ? (
        <iframe
          ref={ref}
          title="Contenuto del messaggio"
          srcDoc={documento}
          onLoad={misura}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          style={{ width: '100%', height: altezza, border: 'none', display: 'block' }}
        />
      ) : (
        <div className="mail-body">{testo}</div>
      )}
    </>
  )
}
