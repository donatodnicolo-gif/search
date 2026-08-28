'use client'

import { useEffect, useRef, useState } from 'react'
import { dalServerCondiviso } from '@/lib/dalServer'
import { dividiCitato, senzaSegnapostoFile } from '@/lib/citato'
import { ripiegaCitatoHtml } from '@/lib/citatoHtml'

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
    // ⚠️ La STESSA chiamata che serve gli allegati (dalServerCondiviso): al
    // mount i due componenti la condividono, così parte una connessione IMAP
    // sola invece di due. Qui si usa solo il pezzo `html`.
    dalServerCondiviso(htmlDalServerDi)
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

  /** Al caricamento dell'iframe: prima si ripiega la conversazione riportata
   *  (come già fa la vista testo con `dividiCitato`), POI si misura — così
   *  l'altezza è quella della sola parte nuova, non dello storico intero. */
  function alCaricamento() {
    const doc = ref.current?.contentDocument
    if (doc) ripiegaCitatoHtml(doc, misura)
    misura()
  }

  useEffect(() => {
    if (vista === 'html') misura()
  }, [vista])

  // ⚠️ Anche da effetto, non solo da onLoad: con `srcDoc` il caricamento può
  // scattare PRIMA che React abbia agganciato il gestore, e il ripiego non
  // partirebbe mai. L'effetto rigira a ogni misura (stesse dipendenze
  // dell'ascolto tasti qui sotto) e `ripiegaCitatoHtml` è idempotente.
  useEffect(() => {
    if (vista !== 'html') return
    const doc = ref.current?.contentDocument
    if (doc?.body) ripiegaCitatoHtml(doc, misura)
  }, [vista, altezza, html])

  /**
   * I TASTI PREMUTI DENTRO LA MAIL ARRIVANO LO STESSO ALLA PAGINA.
   *
   * ⚠️ Il corpo è un iframe. Appena ci si clicca dentro — per scorrere o per
   * selezionare una frase, cioè la cosa più normale del mondo — il fuoco passa
   * al documento dell'iframe, e da quel momento `r`, `e`, `n`, `Canc` non
   * arrivano più a nessuno: chi ascolta sta sulla finestra principale. È il
   * «le scorciatoie a volte non funzionano» segnalato il 20/08/2026, e il
   * «a volte» era proprio questo: dipende da dove hai cliccato l'ultima volta.
   *
   * Si può ascoltare qui perché la sandbox ha `allow-same-origin`. ⚠️ Non ha
   * `allow-scripts`, e non deve averlo: dentro la mail non gira niente: questo
   * ascolto lo installa la PAGINA, non il contenuto. La difesa XSS resta.
   *
   * ⚠️ Si rilancia un evento NUOVO invece di riusare l'originale: un evento
   * appartiene al suo documento e non si può ridispacciare altrove.
   * ⚠️ Coi modificatori premuti non si inoltra: `Ctrl+F` dentro la mail deve
   * restare la ricerca del browser.
   */
  useEffect(() => {
    if (vista !== 'html') return
    const doc = ref.current?.contentDocument
    if (!doc) return
    const inoltra = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: e.key, code: e.code, bubbles: true })
      )
    }
    doc.addEventListener('keydown', inoltra)

    /**
     * OGNI LINK DELLA MAIL SI APRE IN UNA SCHEDA NUOVA, qualunque cosa dichiari.
     *
     * ⚠️ L'involucro ha gia `<base target="_blank">`, ma un `target="_self"`
     * scritto sul SINGOLO link vince sulla regola generale — e le mail vere lo
     * fanno: il «Leggi recensione» di Trustpilot ce l'ha (misurato il
     * 24/08/2026). Il clic navigava l'IFRAME verso trustpilot.com, che rifiuta
     * di essere incorniciato: al posto della mail restava un rettangolo grigio
     * vuoto, e la recensione non si apriva da nessuna parte.
     *
     * Quindi i clic sui link li gestisce la PAGINA: si intercettano qui (stessa
     * strada dei tasti rapidi: sandbox con allow-same-origin, niente script nel
     * contenuto) e si apre una scheda nuova con `noopener` — la pagina aperta
     * non deve poter toccare chi l'ha aperta.
     * ⚠️ Solo http/https: mailto e simili restano al browser.
     */
    const clic = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a')
      const href = a?.getAttribute('href') ?? ''
      const h = href.trim().toLowerCase()
      if (!h.startsWith('http://') && !h.startsWith('https://')) return
      e.preventDefault()
      window.open(href, '_blank', 'noopener,noreferrer')
    }
    doc.addEventListener('click', clic)
    return () => {
      doc.removeEventListener('keydown', inoltra)
      doc.removeEventListener('click', clic)
    }
    // `altezza` è nelle dipendenze perché l'iframe si (ri)crea col contenuto:
    // riagganciarsi dopo il caricamento è ciò che rende l'ascolto affidabile.
  }, [vista, altezza])


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
          onLoad={alCaricamento}
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
  // Via i segnaposto `<firma5.png>` / `<Screenshot ….png>` delle immagini in
  // linea: sono nomi di file, non testo. Le immagini vere stanno nella
  // «versione formattata» e fra gli allegati.
  const pulito = senzaSegnapostoFile(testo)
  const { testo: nuovo, citato } = dividiCitato(pulito)
  if (!citato) return <div className="mail-body">{pulito.trim()}</div>
  return (
    <div className="mail-body">
      {nuovo.trim()}
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
