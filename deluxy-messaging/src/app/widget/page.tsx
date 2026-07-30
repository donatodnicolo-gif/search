'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// La chat che vive dentro l'iframe del widget sui siti. È pubblica: la
// "identità" del visitatore è solo il token di sessione, salvato nel
// localStorage di questo dominio.

type MessaggioWidget = { id: string; direzione: string; testo: string; creatoIl: string }

const CHIAVE_TOKEN = 'deluxy_widget_token'

// I temi validi. Uno sconosciuto ricade su «chiaro» invece di lasciare la chat
// senza colori: il sito ospite scrive quel parametro a mano e un refuso non
// deve produrre una chat rotta.
const TEMI = ['chiaro', 'scuro', 'deluxy', 'caldo', 'minimale', 'automatico']

/** Il colore d'accento arriva dal sito ospite: si accetta solo #rrggbb. */
function accentoValido(v: string): string {
  return /^#[0-9a-f]{6}$/i.test(v) ? v : ''
}

/**
 * Da dove arriva il visitatore, così come lo ha letto `widget.js` sulla pagina
 * ospite e passato nell'URL di questo iframe.
 *
 * ⚠️ Non si può leggere qui dentro: `document.referrer` dentro l'iframe è il
 * sito che ci ospita, non Google. Per questo lo raccoglie lo script di fuori.
 */
function leggiProvenienza(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const p = new URLSearchParams(window.location.search)
  const fuori: Record<string, string> = {}
  for (const chiave of ['utm_source', 'utm_medium', 'utm_campaign', 'gclid', 'fbclid', 'rif', 'pagina']) {
    const v = p.get(chiave)
    if (v) fuori[chiave] = v.slice(0, 120)
  }
  return fuori
}

export default function PaginaWidget() {
  const [token, setToken] = useState<string | null>(null)
  // Da quale sito ci stanno scrivendo: lo dichiara lo snippet (`data-sito`) e
  // decide il titolo e il saluto — e, in Inbox, la colonna in cui finisce la
  // chat. Vuoto = snippet vecchio: valgono i testi generali.
  //
  // ⚠️ SI LEGGE SUBITO, non dentro un `useEffect`. La prima richiesta al server
  // parte da un altro effetto, e gli effetti girano tutti dopo il primo disegno:
  // con il sito preso da uno `setState`, quella richiesta partiva ancora col
  // valore vuoto e il widget chiedeva la configurazione GENERALE. Misurato in
  // produzione il 30/07/2026: su cakedesign.me lo snippet mandava
  // `data-sito="cake"`, l'API rispondeva «CakedesignMe», e la chat mostrava
  // «Deluxy — Ciao! Come possiamo aiutarti?».
  const [sito] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : (new URLSearchParams(window.location.search).get('sito') ?? '')
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '')
          .slice(0, 40)
  )
  const [tema, setTema] = useState('chiaro')
  const [accento, setAccento] = useState('')
  const [titolo, setTitolo] = useState('Deluxy')
  const [benvenuto, setBenvenuto] = useState('')
  const [linkRapidi, setLinkRapidi] = useState<{ testo: string; url: string }[]>([])
  const [messaggi, setMessaggi] = useState<MessaggioWidget[]>([])
  const [bozza, setBozza] = useState('')
  const [pronto, setPronto] = useState(false)
  const [anteprima, setAnteprima] = useState(false)
  const fondoRef = useRef<HTMLDivElement>(null)

  // L'aspetto arriva nell'URL dell'iframe, scritto dallo script sul sito
  // ospite. Si legge da `window.location` e non con useSearchParams per non
  // dover avvolgere tutto in un <Suspense>: questa pagina resta statica, e su
  // un widget che si carica su siti altrui il primo disegno conta.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const t = (p.get('tema') ?? '').toLowerCase()
    if (TEMI.includes(t)) setTema(t)
    setAccento(accentoValido(p.get('accento') ?? ''))
    if (p.get('anteprima')) {
      // ⚠️ L'ANTEPRIMA NON APRE UNA SESSIONE. Guardare i temi nella pagina
      // «Aspetto del widget» creava una conversazione vuota in Inbox per ogni
      // tema guardato: chi sceglie un colore si ritrovava sei clienti finti da
      // archiviare. Qui si mostrano due battute finte e non si parla col server.
      setAnteprima(true)
      setTitolo(p.get('titolo') || 'Deluxy')
      setPronto(true)
      setMessaggi([
        { id: 'a1', direzione: 'out', testo: 'Buongiorno! Come possiamo aiutarla?', creatoIl: '' },
        { id: 'a2', direzione: 'in', testo: 'Vorrei sapere se consegnate domani a Milano', creatoIl: '' },
        { id: 'a3', direzione: 'out', testo: 'Certo, entro le 13 per la consegna del pomeriggio.', creatoIl: '' },
      ])
    }
  }, [])

  // Riprende la conversazione di chi aveva già scritto da questo browser.
  //
  // ⚠️ QUI NON SI CREA NIENTE. Prima la sessione si apriva al caricamento del
  // widget: ogni visitatore che passava sul sito — e ogni anteprima, e ogni
  // prova — lasciava in Inbox una conversazione vuota, indistinguibile da un
  // cliente che ha scritto e aspetta risposta. La conversazione nasce al primo
  // messaggio: prima di quello non c'è niente da leggere.
  useEffect(() => {
    if (anteprima) return
    let annullato = false
    async function riprendi() {
      const salvato = window.localStorage.getItem(CHIAVE_TOKEN)
      if (!salvato) {
        // Nessuno storico: si chiede solo com'è configurato il saluto DI QUESTO
        // SITO — titolo e benvenuto cambiano da deluxy.it a cakedesign.me.
        const res = await fetch(`/api/widget/messaggi${sito ? `?sito=${sito}` : ''}`)
        if (res.ok && !annullato) {
          const dati = (await res.json()) as {
            titolo: string
            benvenuto: string
            linkRapidi?: { testo: string; url: string }[]
          }
          setTitolo(dati.titolo)
          setBenvenuto(dati.benvenuto)
          setLinkRapidi(dati.linkRapidi ?? [])
        }
        if (!annullato) setPronto(true)
        return
      }
      const res = await fetch(`/api/widget/messaggi?token=${encodeURIComponent(salvato)}`)
      if (annullato) return
      if (res.ok) setToken(salvato)
      else {
        // sessione scaduta o cancellata: si riparte da zero al primo messaggio
        window.localStorage.removeItem(CHIAVE_TOKEN)
        setPronto(true)
      }
    }
    riprendi().catch(() => setPronto(true))
    return () => {
      annullato = true
    }
    // `sito` è costante dopo il primo disegno, ma sta fra le dipendenze perché è
    // quello che decide QUALE configurazione si chiede: lasciarlo fuori è
    // esattamente il difetto che si è appena corretto.
  }, [anteprima, sito])

  const aggiorna = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`/api/widget/messaggi?token=${encodeURIComponent(token)}`)
      if (!res.ok) return
      const dati = (await res.json()) as {
        titolo: string
        benvenuto: string
        messaggi: MessaggioWidget[]
      }
      setTitolo(dati.titolo)
      setBenvenuto(dati.benvenuto)
      setMessaggi(dati.messaggi)
      setPronto(true)
    } catch {
      // rete assente: si ritenta al giro dopo
    }
  }, [token])

  useEffect(() => {
    if (!token) return
    aggiorna()
    const t = setInterval(aggiorna, 3500)
    return () => clearInterval(t)
  }, [token, aggiorna])

  useEffect(() => {
    fondoRef.current?.scrollIntoView({ block: 'end' })
  }, [messaggi.length])

  /**
   * Porta il visitatore dove dice il link rapido.
   *
   * ⚠️ La chat vive dentro un iframe su un dominio diverso: da qui
   * `window.top.location` è vietato dal browser, e `window.open` aprirebbe una
   * scheda nuova lasciando il sito alle spalle. L'unica strada pulita è chiedere
   * alla pagina ospite di navigare — `postMessage` — e lasciare che sia lei a
   * decidere se quell'indirizzo va bene. In `widget.js` c'è il controllo.
   *
   * Se il messaggio non arrivasse (script vecchio sul sito), si ripiega su una
   * scheda nuova: meglio una scheda in più che un bottone che non fa niente.
   */
  function vaiA(url: string) {
    try {
      window.parent.postMessage({ tipo: 'deluxy-chat-vai', url }, '*')
      // Se dopo un attimo siamo ancora qui e la pagina ospite non ha fatto
      // niente, il visitatore resterebbe con un clic a vuoto.
      window.setTimeout(() => {
        if (!document.hidden) window.open(url, '_blank', 'noopener')
      }, 600)
    } catch {
      window.open(url, '_blank', 'noopener')
    }
  }

  async function invia() {
    const testo = bozza.trim()
    // In anteprima si può scrivere — serve a vedere il campo pieno — ma non
    // parte niente: dall'altra parte non c'è nessuno.
    if (anteprima) {
      setBozza('')
      return
    }
    if (!testo) return
    setBozza('')
    // eco locale immediata, poi il polling riallinea
    setMessaggi((prec) => [
      ...prec,
      { id: `locale-${Date.now()}`, direzione: 'in', testo, creatoIl: new Date().toISOString() },
    ])
    try {
      // La conversazione nasce adesso, col primo messaggio: è il momento in cui
      // c'è davvero qualcuno dall'altra parte da far vedere in Inbox.
      let miaSessione = token
      if (!miaSessione) {
        // Il sito viaggia con l'apertura della sessione: è l'unico momento in
        // cui si può scrivere sulla conversazione da dove arriva.
        const res = await fetch('/api/widget/sessione', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sito, provenienza: leggiProvenienza() }),
        })
        const dati = (await res.json()) as { token: string }
        miaSessione = dati.token
        window.localStorage.setItem(CHIAVE_TOKEN, miaSessione)
        setToken(miaSessione)
      }
      await fetch('/api/widget/messaggi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: miaSessione, testo }),
      })
    } catch {
      // il polling mostrerà lo stato reale
    }
  }

  return (
    <div
      className="widget-app"
      data-tema={tema}
      // L'accento del sito ospite vince sul tema: è una variabile sola, e i
      // colori derivati (bolla del visitatore, bordo attivo, bottone) la
      // seguono senza altre eccezioni.
      style={accento ? ({ '--w-accento': accento } as React.CSSProperties) : undefined}
    >
      <div className="widget-testata">
        <div>
          <div className="titolo">{titolo}</div>
          <div className="sotto">Di solito rispondiamo in giornata</div>
        </div>
        {/* Sul telefono la chat copre tutto: il bottone che l'ha aperta è
            sotto, quindi la chiusura deve stare qui dentro. */}
        <button
          className="widget-chiudi"
          aria-label="Chiudi la chat"
          onClick={() => window.parent?.postMessage('deluxy-widget:chiudi', '*')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="widget-messaggi">
        {/* Il saluto lo scriviamo NOI: sta a sinistra come tutte le nostre
            risposte. Era marcato «out», cioè dalla parte del visitatore: con i
            temi, che colorano la sua bolla, sembrava scritto da lui. */}
        {pronto && benvenuto ? <div className="bolla in">{benvenuto}</div> : null}

        {/* I LINK RAPIDI: la risposta alla domanda del saluto.
            Chi apre la chat vuole spesso una cosa che il sito ha già — «regali
            per oggi» — e mandarcelo subito vale più di una risposta scritta bene
            dieci minuti dopo. Spariscono appena la conversazione comincia: sopra
            la risposta di una persona sarebbero un invito ad andarsene. */}
        {pronto && !messaggi.length && linkRapidi.length ? (
          <div className="link-rapidi">
            {linkRapidi.map((l) => (
              <button key={l.url + l.testo} type="button" onClick={() => vaiA(l.url)}>
                {l.testo}
              </button>
            ))}
          </div>
        ) : null}
        {messaggi.map((m) => (
          // Nel widget la prospettiva si ribalta: "in" (il visitatore) sta a destra.
          <div key={m.id} className={`bolla ${m.direzione === 'in' ? 'out' : 'in'}`}>
            {m.testo}
          </div>
        ))}
        <div ref={fondoRef} />
      </div>

      <div className="widget-composer">
        <input
          placeholder="Scrivi un messaggio…"
          value={bozza}
          onChange={(e) => setBozza(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') invia()
          }}
        />
        {/* Basta che ci sia del testo: la sessione, se manca, la apre l'invio. */}
        <button className="bottone" onClick={invia} disabled={!bozza.trim()}>
          Invia
        </button>
      </div>
    </div>
  )
}
