'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  /** HTML già sanitizzato lato server, o null se la mail è di solo testo. */
  html: string | null
  testo: string
  /** Traduzione in italiano, se la mail era in lingua straniera. */
  tradotto?: string | null
  /** Lingua rilevata (per il badge). */
  lingua?: string | null
}

/**
 * Mostra il corpo di una mail.
 * - Se c'è una traduzione, la mostra per prima (badge "Tradotto da…") con un
 *   clic per vedere l'originale.
 * - L'originale, se è HTML, si rende dentro un iframe in sandbox SENZA script:
 *   il codice della mail non gira (niente XSS né tracciamento attivo), i link
 *   aprono in scheda nuova, e la pagina ne misura l'altezza per adattarla.
 */
export function CorpoMessaggio({ html, testo, tradotto, lingua }: Props) {
  // Vista iniziale: la traduzione se c'è, altrimenti l'originale nella forma
  // migliore (HTML se disponibile).
  const [vista, setVista] = useState<'tradotto' | 'html' | 'testo'>(
    tradotto ? 'tradotto' : html ? 'html' : 'testo'
  )
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
    if (vista === 'html') misura()
  }, [vista])

  const originale: 'html' | 'testo' = html ? 'html' : 'testo'

  return (
    <>
      {tradotto ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            marginBottom: 10,
            flexWrap: 'wrap',
          }}
        >
          <span className="badge gold">
            <span className="dot" />
            {vista === 'tradotto'
              ? `Tradotto${lingua ? ` dal ${lingua}` : ''} dall’AI`
              : `Originale${lingua ? ` in ${lingua}` : ''}`}
          </span>
          <button
            type="button"
            className="azione-riga"
            onClick={() => setVista((v) => (v === 'tradotto' ? originale : 'tradotto'))}
          >
            {vista === 'tradotto' ? 'Vedi originale' : 'Vedi traduzione'}
          </button>
        </div>
      ) : (
        html && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button
              type="button"
              className="azione-riga"
              onClick={() => setVista((v) => (v === 'html' ? 'testo' : 'html'))}
            >
              {vista === 'html' ? 'Vedi testo semplice' : 'Vedi versione formattata'}
            </button>
          </div>
        )
      )}

      {vista === 'tradotto' && tradotto ? (
        <div className="mail-body">{tradotto}</div>
      ) : vista === 'html' && html ? (
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
