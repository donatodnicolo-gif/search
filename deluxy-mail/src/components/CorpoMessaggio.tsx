'use client'

import { useEffect, useRef, useState } from 'react'
import { leggiHtmlMessaggio } from '@/lib/actions'
import { dividiCitato } from '@/lib/citato'

type Props = {
  /** HTML già sanitizzato lato server, o null se la mail è di solo testo. */
  html: string | null
  testo: string
  /** Traduzione in italiano, se la mail era in lingua straniera. */
  tradotto?: string | null
  /** Lingua rilevata (per il badge). */
  lingua?: string | null
  /**
   * Id del messaggio, passato SOLO quando l'HTML non è nel database ma può
   * essere sul server (mail vecchia, alleggerita per non far crescere il
   * database all'infinito): dopo il render lo si va a riprendere, come già
   * succede per traduzione e allegati. Aprire resta istantaneo.
   */
  htmlDalServerDi?: string
}

/**
 * Mostra il corpo di una mail.
 * - Se c'è una traduzione, la mostra per prima (badge "Tradotto da…") con un
 *   clic per vedere l'originale.
 * - L'originale, se è HTML, si rende dentro un iframe in sandbox SENZA script:
 *   il codice della mail non gira (niente XSS né tracciamento attivo), i link
 *   aprono in scheda nuova, e la pagina ne misura l'altezza per adattarla.
 * - Se l'HTML non è in casa (mail vecchia alleggerita), si mostra SUBITO il
 *   testo e intanto si chiede l'impaginato al server: quando arriva, si passa
 *   da soli alla versione formattata — a meno che l'utente non abbia già
 *   scelto lui una vista, che allora si rispetta.
 */
export function CorpoMessaggio({ html: htmlIniziale, testo, tradotto, lingua, htmlDalServerDi }: Props) {
  const [html, setHtml] = useState(htmlIniziale)
  // Vista iniziale: la traduzione se c'è, altrimenti l'originale nella forma
  // migliore (HTML se disponibile).
  const [vista, setVista] = useState<'tradotto' | 'html' | 'testo'>(
    tradotto ? 'tradotto' : htmlIniziale ? 'html' : 'testo'
  )
  const [recupero, setRecupero] = useState(Boolean(htmlDalServerDi && !htmlIniziale))
  // True appena l'utente sceglie una vista con le proprie mani: da lì in poi
  // l'arrivo dell'HTML dal server non gliela cambia più sotto i piedi.
  const scelto = useRef(false)
  const [altezza, setAltezza] = useState(200)
  const ref = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!htmlDalServerDi || htmlIniziale) return
    let vivo = true
    leggiHtmlMessaggio(htmlDalServerDi)
      .then((r) => {
        if (!vivo) return
        setRecupero(false)
        if (!r.html) return // solo testo, o mail non più sul server: va bene così
        setHtml(r.html)
        if (!scelto.current) setVista((v) => (v === 'testo' ? 'html' : v))
      })
      .catch(() => {
        if (vivo) setRecupero(false)
      })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [htmlDalServerDi])

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
            onClick={() => {
              scelto.current = true
              setVista((v) => (v === 'tradotto' ? originale : 'tradotto'))
            }}
          >
            {vista === 'tradotto' ? 'Vedi originale' : 'Vedi traduzione'}
          </button>
        </div>
      ) : html ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button
            type="button"
            className="azione-riga"
            onClick={() => {
              scelto.current = true
              setVista((v) => (v === 'html' ? 'testo' : 'html'))
            }}
          >
            {vista === 'html' ? 'Vedi testo semplice' : 'Vedi versione formattata'}
          </button>
        </div>
      ) : (
        recupero && (
          <div className="muted" style={{ fontSize: 12, textAlign: 'right', marginBottom: 8 }}>
            Recupero la versione impaginata dal server…
          </div>
        )
      )}

      {vista === 'tradotto' && tradotto ? (
        <TestoConCitazione testo={tradotto} />
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
        <TestoConCitazione testo={testo} />
      )}
    </>
  )
}

/**
 * Il testo di una mail con la CITAZIONE ripiegata: si vede quello che ha
 * scritto chi manda, e la conversazione riportata sotto sta dietro un «…».
 * In un thread di dieci messaggi il decimo contiene i nove precedenti: senza
 * questo, leggere l'ultima risposta vuol dire scorrere tutto ciò che si è già
 * letto. Non si butta niente: si apre con un clic.
 */
function TestoConCitazione({ testo }: { testo: string }) {
  const [apri, setApri] = useState(false)
  const { testo: nuovo, citato } = dividiCitato(testo)
  if (!citato) return <div className="mail-body">{testo}</div>
  return (
    <div className="mail-body">
      {nuovo}
      {'\n'}
      <button
        type="button"
        className="citato-tasto"
        onClick={() => setApri((v) => !v)}
        title={apri ? 'Nascondi la conversazione riportata' : 'Mostra la conversazione riportata sotto'}
      >
        {apri ? '− nascondi il testo citato' : '··· mostra il testo citato'}
      </button>
      {apri && <div className="citato-testo">{citato}</div>}
    </div>
  )
}
