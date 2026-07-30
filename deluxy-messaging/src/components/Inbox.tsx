'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { pezziDiTesto, ripulisciTestoEmail } from '@/lib/testo-email'
import { inserisciScript } from '@/lib/script-testo'
import { urlScriviAiMail } from '@/lib/ai-mail'

// L'inbox unificata: elenco conversazioni a sinistra, thread a destra.
// Si aggiorna da sola con un polling leggero (le nuove conversazioni e i
// nuovi messaggi arrivano dai webhook Meta e dal widget, lato server).

export type ConversazioneDto = {
  id: string
  canale: string
  nome: string
  /**
   * Il nome come sta nella NOSTRA rubrica Google: «FL Mario Rossi #1042» dice
   * chi è e con che ordine, «Nicolo» (il nome del profilo WhatsApp) no. Vince
   * su `nome` quando c'è, senza cancellarlo.
   */
  nomeRubrica?: string
  idEsterno: string
  ultimoTesto: string
  ultimoMessaggioIl: string
  nonLetti: number
  /** Il nostro numero che ha ricevuto (solo WhatsApp), in forma leggibile. */
  numeroNostro?: string
  /** Il numero dell'ordine di cui parla la conversazione, se lo sappiamo. */
  ordineNumero?: string
  /** Il marchio di quell'account, se è collegato a un negozio. Decide la colonna. */
  brand?: string
  /**
   * Come si chiama la linea che ha ricevuto («CakeDesignMe», «@deluxyflowers»,
   * «Servizio Clienti»). ⚠️ NON è un marchio: è un nome che ci siamo dati noi, e
   * usarlo come marchio faceva nascere una colonna che sembrava un brand in più.
   */
  etichettaAccount?: string
}

type MessaggioDto = {
  id: string
  direzione: string
  testo: string
  /** L'oggetto, solo sulle mail: è la prima cosa che si legge. */
  oggetto?: string
  /** C'è un file allegato (WhatsApp): si scarica da /api/media/[id]. */
  mediaId?: string
  mimeType?: string
  nomeFile?: string
  /** Chi ha scritto, solo in uscita. Vuoto sui messaggi vecchi: parte da ora. */
  utenteNome?: string
  stato: string
  errore: string
  creatoIl: string
}

/** Una risposta pronta, come sta in /script. */
type ScriptDto = {
  id: string
  titolo: string
  categoria: string
  testo: string
  quando: string
  attivo: boolean
}

const NOMI_CANALE: Record<string, string> = {
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
  widget: 'Sito',
  email: 'Email',
}

function etichettaCanale(canale: string): string {
  return NOMI_CANALE[canale] ?? canale
}

function oraBreve(iso: string): string {
  const d = new Date(iso)
  const oggi = new Date()
  const stessoGiorno = d.toDateString() === oggi.toDateString()
  if (stessoGiorno) return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}

/** Oltre questa lunghezza la bolla si chiude: una mail intera è un muro. */
const LIMITE_TESTO = 900

// Una bolla del thread. Le mail arrivano lunghissime e piene di link di
// tracciamento: qui si mostrano ripulite, accorciate e coi link ridotti al
// nome del sito. Il testo com'era arrivato resta a un clic di distanza.
function Bolla({ m, canale }: { m: MessaggioDto; canale: string }) {
  const [tutto, setTutto] = useState(false)
  const [grezzo, setGrezzo] = useState(false)

  // Solo le mail si ripuliscono: su WhatsApp e widget il cliente scrive a mano
  // e quello che manda va letto com'è.
  const pulito = useMemo(
    () => (canale === 'email' ? ripulisciTestoEmail(m.testo) : m.testo),
    [canale, m.testo]
  )
  const testo = grezzo ? m.testo : pulito
  const tagliato = !tutto && testo.length > LIMITE_TESTO
  const visibile = tagliato ? `${testo.slice(0, LIMITE_TESTO).trimEnd()}…` : testo
  const pezzi = useMemo(() => (grezzo ? null : pezziDiTesto(visibile)), [grezzo, visibile])

  const accorciaLink = pezzi?.some((p) => p.tipo === 'link' && p.etichetta !== p.url) ?? false
  const cambiato = pulito !== m.testo || accorciaLink

  // L'allegato viene prima del testo: quando c'è una foto, il testo è la sua
  // didascalia. Il file non è nostro — lo tiene Meta — e `/api/media/[id]` fa
  // da ponte col token giusto.
  const allegato = m.mediaId ? `/api/media/${m.id}` : ''
  const eFoto = (m.mimeType ?? '').startsWith('image/')
  // Col file davanti, un testo tipo «[image]» o il nome del file è rumore: è
  // già scritto sopra. Una didascalia vera invece si mostra.
  const testoInutile =
    Boolean(allegato) && (/^\[[^\]]+\]$/.test(m.testo.trim()) || m.testo.trim() === m.nomeFile)

  return (
    <div className={`bolla ${m.direzione === 'out' ? 'out' : 'in'}`}>
      {m.oggetto ? <span className="oggetto">{m.oggetto}</span> : null}
      {allegato ? (
        eFoto ? (
          <a href={allegato} target="_blank" rel="noreferrer noopener" className="allegato-foto">
            {/* Niente <Image> di Next: il file passa dalla nostra rotta con la
                sessione, e l'ottimizzatore non ci arriva. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={allegato} alt={m.nomeFile || 'Foto ricevuta'} loading="lazy" />
          </a>
        ) : (
          <a href={allegato} target="_blank" rel="noreferrer noopener" className="allegato-file">
            <span className="icona" aria-hidden="true">
              ↓
            </span>
            <span className="nome">{m.nomeFile || 'Allegato'}</span>
          </a>
        )
      ) : null}
      {testoInutile ? null : pezzi ? (
        pezzi.map((p, i) =>
          p.tipo === 'link' ? (
            <a
              key={i}
              className="link-messaggio"
              href={p.url}
              title={p.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              {p.etichetta}
            </a>
          ) : (
            <span key={i}>{p.testo}</span>
          )
        )
      ) : (
        visibile
      )}
      {tagliato || tutto || cambiato ? (
        <span className="azioni-testo">
          {tagliato || tutto ? (
            <button type="button" onClick={() => setTutto(!tutto)}>
              {tutto ? 'Mostra meno' : 'Mostra tutto'}
            </button>
          ) : null}
          {cambiato ? (
            <button
              type="button"
              onClick={() => setGrezzo(!grezzo)}
              title="Il testo com'è arrivato, link di tracciamento compresi"
            >
              {grezzo ? 'Testo leggibile' : 'Testo originale'}
            </button>
          ) : null}
        </span>
      ) : null}
      <span className={`meta${m.stato === 'errore' ? ' errore' : ''}`}>
        {oraBreve(m.creatoIl)}
        {/* Chi ha risposto: quando la conversazione passa di mano è la
            prima cosa che si cerca. Vuoto sui messaggi vecchi. */}
        {m.direzione === 'out' && m.utenteNome ? ` · ${m.utenteNome}` : ''}
        {m.direzione === 'out' && m.stato
          ? ` · ${m.stato === 'errore' ? m.errore || 'errore' : m.stato}`
          : ''}
      </span>
    </div>
  )
}

/** Dove finiscono le conversazioni che non sappiamo di chi sono. */
const SENZA_MARCHIO = 'Senza marchio'

// Le iconcine delle azioni rapide. Disegnate qui e non prese da una libreria:
// tre icone non giustificano un pacchetto, e `currentColor` le fa seguire il
// colore del bottone (grigie, rosse sull'elimina) senza doppioni di CSS.

function IconaArchivia() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="2" y="3" width="12" height="3" rx="1" />
      <path d="M3 6.5v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-6" />
      <path d="M6.5 9h3" />
    </svg>
  )
}

function IconaRiporta() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M8 13V4" />
      <path d="M4.5 7.5 8 4l3.5 3.5" />
      <path d="M3 13h10" />
    </svg>
  )
}

function IconaElimina() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M3 5h10" />
      <path d="M6.5 5V3.5h3V5" />
      <path d="M4.5 5v8a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V5" />
      <path d="M7 7.5v4M9 7.5v4" />
    </svg>
  )
}

export function Inbox({
  conversazioniIniziali,
  brandNoti = [],
}: {
  conversazioniIniziali: ConversazioneDto[]
  /** I marchi che POSSONO ricevere (numeri WhatsApp e account Meta collegati):
   *  la loro colonna si vede anche vuota, altrimenti «zero messaggi oggi»
   *  sembrerebbe «marchio non configurato». */
  brandNoti?: string[]
}) {
  const [conversazioni, setConversazioni] = useState(conversazioniIniziali)
  // `?c=<id>`: la schermata «Oggi» manda qui su una conversazione precisa. Senza,
  // il collegamento «chi aspetta una risposta» aprirebbe l'inbox e lascerebbe a
  // chi lavora il compito di ritrovare la riga che aveva appena letto.
  const parametri = useSearchParams()
  const [selezionataId, setSelezionataId] = useState<string | null>(parametri.get('c'))
  // Tre elenchi, la stessa schermata: in arrivo, archivio, cestino. L'archivio
  // è dove si mette via quello che non serve più; il cestino è dove finisce
  // quello che si butta, e da cui si può ancora tornare per 30 giorni.
  const [vistaElenco, setVistaElenco] = useState<'arrivo' | 'archivio' | 'cestino'>('arrivo')
  const archivio = vistaElenco === 'archivio'
  const cestino = vistaElenco === 'cestino'
  const [quanteArchiviate, setQuanteArchiviate] = useState(0)
  const [quanteNelCestino, setQuanteNelCestino] = useState(0)
  const [messaggi, setMessaggi] = useState<MessaggioDto[]>([])
  const [bozza, setBozza] = useState('')
  const [inviando, setInviando] = useState(false)
  const [erroreInvio, setErroreInvio] = useState('')
  const fondoRef = useRef<HTMLDivElement>(null)

  const selezionata = conversazioni.find((c) => c.id === selezionataId) ?? null

  const aggiornaConversazioni = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/conversazioni${vistaElenco === 'arrivo' ? '' : `?vista=${vistaElenco}`}`
      )
      if (!res.ok) return
      const dati = (await res.json()) as {
        conversazioni: (ConversazioneDto & { ultimoMessaggioIl: string })[]
        archiviate?: number
        nelCestino?: number
      }
      setConversazioni(dati.conversazioni)
      setQuanteArchiviate(dati.archiviate ?? 0)
      setQuanteNelCestino(dati.nelCestino ?? 0)
    } catch {
      // rete assente: si ritenta al giro dopo
    }
  }, [vistaElenco])

  // Cambiando linguetta l'elenco si ricarica subito, senza aspettare i 5
  // secondi del polling — e la conversazione aperta si chiude, perché appartiene
  // all'elenco di prima.
  //
  // ⚠️ Al PRIMO giro non si chiude niente: le conversazioni iniziali arrivano
  // già dal server e la selezione può venire da `?c=`. Senza questa guardia, il
  // collegamento dalla schermata «Oggi» apriva la conversazione e la richiudeva
  // da solo un istante dopo.
  const primoGiro = useRef(true)
  useEffect(() => {
    if (primoGiro.current) {
      primoGiro.current = false
      return
    }
    setSelezionataId(null)
    aggiornaConversazioni()
  }, [vistaElenco, aggiornaConversazioni])

  // ── Notifica audio: quando arriva un messaggio si sente ──
  //
  // ⚠️ Il suono si genera con la Web Audio API, non con un file: un mp3 va
  // caricato, servito e può non arrivare, e per due note è peso inutile. E ⚠️ i
  // browser non fanno suonare niente prima che l'utente abbia cliccato qualcosa
  // nella pagina — è una regola loro, non un difetto: perciò il contesto audio
  // si crea al primo clic, e finché non c'è il primo clic non si sente nulla.
  const [audioAcceso, setAudioAcceso] = useState(true)
  const audioRef = useRef<AudioContext | null>(null)
  const nonLettiPrec = useRef<number | null>(null)

  const suona = useCallback(() => {
    if (!audioAcceso) return
    try {
      type ConWebkit = typeof window & { webkitAudioContext?: typeof AudioContext }
      const Costruttore = window.AudioContext ?? (window as ConWebkit).webkitAudioContext
      if (!Costruttore) return
      audioRef.current ??= new Costruttore()
      const ctx = audioRef.current
      if (ctx.state === 'suspended') void ctx.resume()
      // Due note brevi che salgono: si sente in un ufficio ma non fa saltare.
      const ora = ctx.currentTime
      for (const [i, frequenza] of [880, 1174].entries()) {
        const osc = ctx.createOscillator()
        const volume = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = frequenza
        // L'attacco e la coda evitano il «clic» secco di un'onda tagliata.
        volume.gain.setValueAtTime(0, ora + i * 0.12)
        volume.gain.linearRampToValueAtTime(0.14, ora + i * 0.12 + 0.02)
        volume.gain.exponentialRampToValueAtTime(0.001, ora + i * 0.12 + 0.16)
        osc.connect(volume).connect(ctx.destination)
        osc.start(ora + i * 0.12)
        osc.stop(ora + i * 0.12 + 0.18)
      }
    } catch {
      // audio non disponibile: non è un errore che valga un avviso
    }
  }, [audioAcceso])

  // ── Avvisi del browser ──
  //
  // ⚠️ Il permesso lo deve chiedere un CLIC: i browser rifiutano
  // `requestPermission()` chiamata al caricamento della pagina, e chiederlo
  // appena si apre l'app è anche il modo migliore per farselo negare per sempre.
  // Perciò c'è un bottone.
  //
  // E si avvisa solo a **scheda non in primo piano**: se stai guardando l'inbox
  // la conversazione nuova la vedi comparire, e una notifica di sistema sopra la
  // cosa che stai già guardando è rumore. Con la scheda dietro, invece, è
  // l'unico modo per sapere che è arrivato qualcosa.
  const [avvisi, setAvvisi] = useState(false)

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      setAvvisi(true)
    }
  }, [])

  async function chiediAvvisi() {
    if (typeof Notification === 'undefined') {
      setErroreInvio('Questo browser non sa mostrare avvisi di sistema.')
      return
    }
    if (avvisi) {
      // Il permesso non si revoca da qui — lo fa il browser: quello che si può
      // spegnere è il nostro uso, e va detto invece di far finta.
      setAvvisi(false)
      return
    }
    const esito = await Notification.requestPermission()
    if (esito === 'granted') setAvvisi(true)
    else
      setErroreInvio(
        'Avvisi bloccati dal browser: si riattivano dall’icona del lucchetto accanto all’indirizzo.'
      )
  }

  const avvisa = useCallback(
    (quante: number) => {
      if (!avvisi || typeof Notification === 'undefined') return
      if (Notification.permission !== 'granted') return
      if (typeof document !== 'undefined' && !document.hidden) return
      try {
        const n = new Notification(
          quante === 1 ? 'Nuovo messaggio' : `${quante} nuovi messaggi`,
          {
            body: 'Deluxy Customer Service — un cliente sta aspettando una risposta.',
            // `tag` fa sostituire l'avviso precedente invece di impilarne dieci
            // durante una raffica.
            tag: 'deluxy-inbox',
          }
        )
        n.onclick = () => {
          window.focus()
          n.close()
        }
      } catch {
        // avviso non mostrato: non è un errore che valga un messaggio in pagina
      }
    },
    [avvisi]
  )

  // Il totale dei non letti è il segnale più semplice e più affidabile: cresce
  // solo quando arriva davvero qualcosa. Contare le conversazioni nuove
  // suonerebbe anche quando una torna in cima per una nostra risposta.
  useEffect(() => {
    if (vistaElenco !== 'arrivo') return
    const totale = conversazioni.reduce((s, c) => s + c.nonLetti, 0)
    const prima = nonLettiPrec.current
    nonLettiPrec.current = totale
    // Al primo caricamento non si suona: aprire l'inbox con 106 non letti non è
    // un messaggio appena arrivato.
    if (prima !== null && totale > prima) {
      suona()
      avvisa(totale - prima)
    }
  }, [conversazioni, vistaElenco, suona, avvisa])

  const caricaMessaggi = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/conversazioni/${id}/messaggi`)
      if (!res.ok) return
      const dati = (await res.json()) as { messaggi: MessaggioDto[] }
      setMessaggi(dati.messaggi)
      // aprire il thread azzera i non letti anche in locale
      setConversazioni((prec) => prec.map((c) => (c.id === id ? { ...c, nonLetti: 0 } : c)))
    } catch {
      // rete assente: si ritenta al giro dopo
    }
  }, [])

  // Polling: elenco ogni 5s, thread aperto ogni 4s.
  useEffect(() => {
    const t = setInterval(aggiornaConversazioni, 5000)
    return () => clearInterval(t)
  }, [aggiornaConversazioni])

  useEffect(() => {
    if (!selezionataId) return
    caricaMessaggi(selezionataId)
    const t = setInterval(() => caricaMessaggi(selezionataId), 4000)
    return () => clearInterval(t)
  }, [selezionataId, caricaMessaggi])

  useEffect(() => {
    fondoRef.current?.scrollIntoView({ block: 'end' })
  }, [messaggi.length, selezionataId])

  // Chiede all'AI una risposta partendo dagli Script. Il testo va nel riquadro
  // di scrittura: l'operatore lo legge, lo corregge e poi decide se inviarlo.
  const [suggerendo, setSuggerendo] = useState(false)
  const [suggerimento, setSuggerimento] = useState<{ titolo: string } | null>(null)

  async function suggerisci() {
    if (!selezionataId) return
    setSuggerendo(true)
    setErroreInvio('')
    setSuggerimento(null)
    try {
      const res = await fetch('/api/script/suggerisci', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversazioneId: selezionataId }),
      })
      const d = (await res.json().catch(() => ({}))) as {
        suggerimento?: { titolo: string; risposta: string } | null
        errore?: string
      }
      if (!res.ok) {
        setErroreInvio(d.errore || 'Nessuna risposta suggerita.')
        return
      }
      if (!d.suggerimento) {
        setErroreInvio('Nessuno script adatto a questo messaggio: rispondi a mano.')
        return
      }
      setBozza(d.suggerimento.risposta)
      setSuggerimento({ titolo: d.suggerimento.titolo })
    } catch {
      setErroreInvio('Suggerimento non riuscito: problema di rete.')
    } finally {
      setSuggerendo(false)
    }
  }

  async function invia() {
    if (!selezionataId || !bozza.trim() || inviando) return
    setInviando(true)
    setErroreInvio('')
    try {
      const res = await fetch(`/api/conversazioni/${selezionataId}/messaggi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testo: bozza.trim() }),
      })
      const dati = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok && dati.errore) setErroreInvio(dati.errore)
      setBozza('')
      await caricaMessaggi(selezionataId)
      await aggiornaConversazioni()
    } catch {
      setErroreInvio('Invio non riuscito: problema di rete.')
    } finally {
      setInviando(false)
    }
  }

  // Vista: una colonna per marchio (come la bacheca degli Ordini) oppure
  // l'elenco unico di sempre. Le colonne rispondono a «come stiamo andando su
  // Flowers?» senza filtrare; l'elenco resta per lavorare a ordine di arrivo.
  const [vista, setVista] = useState<'colonne' | 'elenco'>('colonne')
  // A colonne il thread non ha una sua metà di schermo: si apre in una
  // finestra sopra la bacheca, come il dettaglio di un ordine.
  const aFinestra = vista === 'colonne'

  function chiudiFinestra() {
    setSelezionataId(null)
    setErroreInvio('')
    setSuggerimento(null)
  }

  // Esc chiude: aperta una finestra, è il gesto che tutti provano per primo.
  useEffect(() => {
    if (!aFinestra || !selezionataId) return
    function suTasto(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSelezionataId(null)
        setErroreInvio('')
      }
    }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [aFinestra, selezionataId])

  const marchioDi = useCallback((c: ConversazioneDto) => c.brand || SENZA_MARCHIO, [])

  // Le colonne: prima i marchi collegati (anche se oggi non hanno scritto),
  // poi quelli che compaiono solo nelle conversazioni, e per ultimo il
  // «senza marchio» — che è un lavoro da fare, non un marchio.
  const colonne = useMemo(() => {
    const nomi: string[] = [...brandNoti]
    for (const c of conversazioni) {
      const m = marchioDi(c)
      if (m !== SENZA_MARCHIO && !nomi.includes(m)) nomi.push(m)
    }
    const gruppi = nomi.map((nome) => ({
      nome,
      righe: conversazioni.filter((c) => marchioDi(c) === nome),
    }))
    const orfane = conversazioni.filter((c) => marchioDi(c) === SENZA_MARCHIO)
    if (orfane.length) gruppi.push({ nome: SENZA_MARCHIO, righe: orfane })
    return gruppi
  }, [brandNoti, conversazioni, marchioDi])

  // ── Risposte pronte, per tipologia ──
  //
  // La «Risposta rapida» chiede all'AI di scegliere: costa qualche secondo e
  // ogni tanto sceglie male. Qui l'operatore prende la tipologia che sa già
  // essere quella giusta e il testo entra subito. Le due cose convivono: l'AI
  // per i casi da capire, l'elenco per i novanta casi su cento che si
  // riconoscono a colpo d'occhio.
  // ── Chi è questo numero? ──
  // La rubrica Google (deluxy.delivery@gmail.com) sa già chi sono: il giro
  // automatico ci passa ogni ora, ma chi ha il cliente davanti non aspetta
  // l'ora.
  const [cercandoRubrica, setCercandoRubrica] = useState(false)
  async function cercaInRubrica() {
    if (!selezionataId || cercandoRubrica) return
    setCercandoRubrica(true)
    setErroreInvio('')
    try {
      const res = await fetch(`/api/conversazioni/${selezionataId}/rubrica`, { method: 'POST' })
      const d = (await res.json().catch(() => ({}))) as {
        trovato?: boolean
        nome?: string
        errore?: string
      }
      if (!res.ok) setErroreInvio(d.errore || 'Ricerca in rubrica non riuscita.')
      else if (!d.trovato) setErroreInvio('Questo numero non è nella rubrica Google.')
      else
        setConversazioni((prec) =>
          prec.map((c) => (c.id === selezionataId ? { ...c, nomeRubrica: d.nome ?? '' } : c))
        )
    } catch {
      setErroreInvio('Ricerca in rubrica non riuscita: problema di rete.')
    } finally {
      setCercandoRubrica(false)
    }
  }

  // ── Togliere una conversazione dall'inbox ──
  // Archivia = sparisce e resta (e si riporta indietro dall'archivio);
  // Elimina = via davvero, messaggi compresi.
  const [inCorsoTogli, setInCorsoTogli] = useState(false)

  /** Sparisce dall'elenco che stiamo guardando e la selezione si libera. */
  function togliDallElenco(id: string) {
    setConversazioni((prec) => prec.filter((c) => c.id !== id))
    setSelezionataId((prec) => (prec === id ? null : prec))
  }

  async function archivia(id: string, archiviata = true) {
    if (inCorsoTogli) return
    setInCorsoTogli(true)
    try {
      const res = await fetch(`/api/conversazioni/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archiviata }),
      })
      if (!res.ok) {
        setErroreInvio(archiviata ? 'Archiviazione non riuscita.' : 'Non è tornata in inbox.')
        return
      }
      togliDallElenco(id)
      setQuanteArchiviate((n) => Math.max(0, n + (archiviata ? 1 : -1)))
    } catch {
      setErroreInvio('Operazione non riuscita: problema di rete.')
    } finally {
      setInCorsoTogli(false)
    }
  }

  /** Dal cestino torna in posta in arrivo. */
  async function ripristina(id: string) {
    if (inCorsoTogli) return
    setInCorsoTogli(true)
    try {
      const res = await fetch(`/api/conversazioni/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ripristina: true }),
      })
      if (!res.ok) {
        setErroreInvio('Ripristino non riuscito.')
        return
      }
      togliDallElenco(id)
      setQuanteNelCestino((n) => Math.max(0, n - 1))
    } catch {
      setErroreInvio('Ripristino non riuscito: problema di rete.')
    } finally {
      setInCorsoTogli(false)
    }
  }

  /**
   * Elimina: dall'inbox va nel CESTINO (30 giorni per cambiare idea); dal
   * cestino cancella per sempre, e solo lì la conferma parla di «per sempre».
   */
  async function elimina(id: string) {
    if (inCorsoTogli) return
    const c = conversazioni.find((x) => x.id === id)
    const chi = c ? c.nomeRubrica || c.nome || c.idEsterno : 'questa conversazione'
    // La conferma sta QUI, davanti al gesto, e dice cosa succede davvero: un
    // «sei sicuro?» generico non è una conferma.
    if (cestino) {
      if (
        !window.confirm(
          `Cancellare per sempre la conversazione con ${chi}?\n\nSpariscono anche tutti i suoi messaggi e non si torna indietro. Se aspetti, il cestino si svuota da solo dopo 30 giorni.`
        )
      ) {
        return
      }
    }
    setInCorsoTogli(true)
    try {
      const res = await fetch(
        `/api/conversazioni/${id}${cestino ? '?definitivo=1' : ''}`,
        { method: 'DELETE' }
      )
      if (!res.ok) {
        setErroreInvio('Eliminazione non riuscita.')
        return
      }
      togliDallElenco(id)
      if (cestino) setQuanteNelCestino((n) => Math.max(0, n - 1))
      else {
        setQuanteNelCestino((n) => n + 1)
        if (archivio) setQuanteArchiviate((n) => Math.max(0, n - 1))
      }
    } catch {
      setErroreInvio('Eliminazione non riuscita: problema di rete.')
    } finally {
      setInCorsoTogli(false)
    }
  }

  // L'oggetto con cui rispondere a una mail: quello dell'ultima ricevuta, con
  // «Re:» davanti se non ce l'ha già. È la stessa regola che usa l'invio
  // dell'app, così la finestra di AI Mail si apre con quello che ci si aspetta.
  const oggettoRisposta = useMemo(() => {
    const ultimo = [...messaggi].reverse().find((m) => m.direzione === 'in' && m.oggetto?.trim())
      ?.oggetto
    if (!ultimo) return 'Messaggio da Deluxy'
    return /^re:/i.test(ultimo) ? ultimo : `Re: ${ultimo}`
  }, [messaggi])

  const [risposteAperte, setRisposteAperte] = useState(false)
  const [risposte, setRisposte] = useState<ScriptDto[]>([])
  const [cercaRisposta, setCercaRisposta] = useState('')
  const bozzaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!risposteAperte || risposte.length) return
    fetch('/api/script')
      .then((r) => (r.ok ? r.json() : { script: [] }))
      .then((d: { script?: ScriptDto[] }) => setRisposte((d.script ?? []).filter((s) => s.attivo)))
      .catch(() => setRisposte([]))
  }, [risposteAperte, risposte.length])

  function usaRisposta(s: ScriptDto) {
    const campo = bozzaRef.current
    // Il testo entra dove sta il cursore e, se nel riquadro c'è già un saluto,
    // quello dello script si toglie: altrimenti il cliente riceve
    // «Buongiorno… Buongiorno…» ogni singola volta.
    const da = campo?.selectionStart ?? bozza.length
    const a = campo?.selectionEnd ?? bozza.length
    const esito = inserisciScript(bozza, s.testo, da, a)
    setBozza(esito.testo)
    setRisposteAperte(false)
    // Il conteggio degli usi ordina l'elenco: i più usati vengono prima.
    fetch(`/api/script/${s.id}/usato`, { method: 'POST' }).catch(() => {})
    requestAnimationFrame(() => {
      campo?.focus()
      campo?.setSelectionRange(esito.nuovoCursore, esito.nuovoCursore)
    })
  }

  // Manda un file su WhatsApp. Il testo scritto nel riquadro diventa la
  // didascalia della foto: è quello che ci si aspetta scrivendo prima e
  // allegando dopo.
  const fileRef = useRef<HTMLInputElement>(null)
  const [caricando, setCaricando] = useState(false)

  async function mandaFile(file: File) {
    if (!selezionataId || caricando) return
    setCaricando(true)
    setErroreInvio('')
    try {
      const modulo = new FormData()
      modulo.append('file', file)
      if (bozza.trim()) modulo.append('didascalia', bozza.trim())
      const res = await fetch(`/api/conversazioni/${selezionataId}/allegati`, {
        method: 'POST',
        body: modulo,
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok) setErroreInvio(d.errore || 'Invio del file non riuscito.')
      else setBozza('')
      await caricaMessaggi(selezionataId)
      await aggiornaConversazioni()
    } catch {
      setErroreInvio('Invio del file non riuscito: problema di rete.')
    } finally {
      setCaricando(false)
      if (fileRef.current) fileRef.current.value = '' // lo stesso file si può rimandare
    }
  }

  // Scarica la posta dalla casella register.it: le mail entrano come
  // conversazioni del canale Email.
  const [scaricoPosta, setScaricoPosta] = useState('')
  async function scaricaPosta() {
    setScaricoPosta('…')
    try {
      const res = await fetch('/api/email/sync', { method: 'POST' })
      const d = (await res.json().catch(() => ({}))) as {
        nuove?: number
        lette?: number
        errore?: string
      }
      setScaricoPosta(res.ok ? `${d.nuove ?? 0} nuove` : d.errore || 'errore')
      await aggiornaConversazioni()
    } catch {
      setScaricoPosta('errore di rete')
    }
    setTimeout(() => setScaricoPosta(''), 6000)
  }

  function riga(c: ConversazioneDto) {
    function apri() {
      setSelezionataId(c.id)
      setErroreInvio('')
    }
    return (
      /**
       * ⚠️ Un `div` con `role="button"`, non un `<button>`: dentro ci stanno le
       * iconcine di archiviazione, e un bottone dentro un bottone è HTML non
       * valido (i browser lo "riparano" sputando fuori i figli, e la riga si
       * scompone). `tabIndex` + Invio/Spazio perché una riga cliccabile che la
       * tastiera non raggiunge è un bottone solo per il mouse.
       */
      <div
        key={c.id}
        role="button"
        tabIndex={0}
        className={`riga-conversazione${c.id === selezionataId ? ' selezionata' : ''}`}
        onClick={apri}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            apri()
          }
        }}
      >
        <span className="testata">
          <span
            className="nome"
            title={c.nomeRubrica ? `In rubrica: ${c.nomeRubrica}` : undefined}
          >
            {c.nomeRubrica || c.nome || c.idEsterno}
          </span>
          <span className="ora">{oraBreve(c.ultimoMessaggioIl)}</span>
        </span>
        <span className="anteprima">
          <span className={`badge canale-${c.canale}`}>{etichettaCanale(c.canale)}</span>
          {/* Su quale nostra linea ha scritto. Con più WhatsApp Business è la
              prima cosa da sapere: cambia il tono, la firma e chi risponde.
              Dentro le colonne sparisce: la colonna dice già il marchio. */}
          {c.brand || c.etichettaAccount || c.numeroNostro ? (
            <span
              className="badge badge-marchio"
              title={`Arrivato su ${c.etichettaAccount || c.numeroNostro || 'una linea non collegata'}`}
            >
              {c.brand || c.etichettaAccount || c.numeroNostro}
            </span>
          ) : null}
          <span className="testo">{c.ultimoTesto}</span>
          {c.nonLetti > 0 ? <span className="pill-nonletti">{c.nonLetti}</span> : null}
        </span>

        {/* Le due azioni che si fanno di continuo, senza aprire niente.
            ⚠️ `stopPropagation`: senza, archiviare aprirebbe anche il thread di
            una conversazione che sta sparendo. */}
        <span className="azioni-riga">
          {cestino ? (
            <button
              aria-label="Ripristina"
              title="Riporta in posta in arrivo"
              onClick={(e) => {
                e.stopPropagation()
                ripristina(c.id)
              }}
              disabled={inCorsoTogli}
            >
              <IconaRiporta />
            </button>
          ) : archivio ? (
            <button
              aria-label="Riporta in inbox"
              title="Riporta in posta in arrivo"
              onClick={(e) => {
                e.stopPropagation()
                archivia(c.id, false)
              }}
              disabled={inCorsoTogli}
            >
              <IconaRiporta />
            </button>
          ) : (
            <button
              aria-label="Archivia"
              title="Archivia: sparisce dall'elenco ma resta salvata"
              onClick={(e) => {
                e.stopPropagation()
                archivia(c.id)
              }}
              disabled={inCorsoTogli}
            >
              <IconaArchivia />
            </button>
          )}
          <button
            className="pericolo"
            aria-label={cestino ? 'Cancella per sempre' : 'Sposta nel cestino'}
            title={
              cestino
                ? 'Cancella per sempre, coi suoi messaggi'
                : 'Sposta nel cestino: resta 30 giorni, poi si cancella'
            }
            onClick={(e) => {
              e.stopPropagation()
              elimina(c.id)
            }}
            disabled={inCorsoTogli}
          >
            <IconaElimina />
          </button>
        </span>
      </div>
    )
  }

  return (
    <>
    <div className={`inbox${aFinestra ? ' a-colonne' : ''}`}>
      <div className="elenco">
        <div className="barra-elenco">
          {/* Le due linguette: posta in arrivo e archivio. Il numero
              sull'archivio arriva sempre dal server, anche stando in arrivo:
              «quante ne ho messe via» si vede senza dover cliccare. */}
          <span className="linguette">
            <button
              className={vistaElenco === 'arrivo' ? 'attiva' : ''}
              onClick={() => setVistaElenco('arrivo')}
              title="Le conversazioni da lavorare"
            >
              In arrivo
            </button>
            <button
              className={vistaElenco === 'archivio' ? 'attiva' : ''}
              onClick={() => setVistaElenco('archivio')}
              title="Quelle messe via: ci sono tutte e si riportano indietro"
            >
              Archiviate{quanteArchiviate ? ` ${quanteArchiviate}` : ''}
            </button>
            <button
              className={vistaElenco === 'cestino' ? 'attiva' : ''}
              onClick={() => setVistaElenco('cestino')}
              title="Quelle buttate: restano 30 giorni, poi si cancellano da sole"
            >
              Cestino{quanteNelCestino ? ` ${quanteNelCestino}` : ''}
            </button>
          </span>
          <button className="bottone secondario mini" onClick={scaricaPosta} disabled={scaricoPosta === '…'}>
            {scaricoPosta === '…' ? 'Scarico posta…' : 'Scarica posta'}
          </button>
          {scaricoPosta && scaricoPosta !== '…' ? (
            <span className="esito">{scaricoPosta}</span>
          ) : null}
          {/* Il suono si può spegnere: in una stanza con tre operatori, tre
              campanelli sullo stesso messaggio sono rumore. */}
          <button
            className="bottone secondario mini"
            style={{ marginLeft: 'auto' }}
            onClick={() => {
              const nuovo = !audioAcceso
              setAudioAcceso(nuovo)
              // Si prova subito: un interruttore audio che non fa sentire cosa
              // hai acceso è un interruttore di cui non si sa lo stato.
              if (nuovo) setTimeout(suona, 60)
            }}
            title={
              audioAcceso
                ? 'Suono acceso: si sente quando arriva un messaggio'
                : 'Suono spento'
            }
          >
            {audioAcceso ? 'Suono' : 'Muto'}
          </button>
          {/* Avvisi del browser: arrivano anche con la scheda dietro, che è
              quando servono. Il permesso lo deve chiedere un clic. */}
          <button
            className="bottone secondario mini"
            onClick={chiediAvvisi}
            title={
              avvisi
                ? 'Avvisi attivi: compaiono quando la scheda non è in primo piano'
                : 'Chiedi al browser di mostrare un avviso quando arriva un messaggio'
            }
          >
            {avvisi ? 'Avvisi' : 'Avvisi off'}
          </button>
          <button
            className="bottone secondario mini"
            onClick={() => setVista(vista === 'colonne' ? 'elenco' : 'colonne')}
            title={
              vista === 'colonne'
                ? 'Tutte le conversazioni in un elenco solo, per ordine di arrivo'
                : 'Una colonna per marchio'
            }
          >
            {vista === 'colonne' ? 'Elenco' : 'Colonne'}
          </button>
        </div>

        {conversazioni.length === 0 ? (
          <div className="vuoto" style={{ padding: 30 }}>
            {cestino
              ? 'Cestino vuoto. Quello che elimini finisce qui e ci resta 30 giorni: poi si cancella da solo, coi suoi messaggi.'
              : archivio
                ? 'Archivio vuoto. Le conversazioni che archivi finiscono qui, e da qui si riportano indietro.'
                : 'Nessuna conversazione ancora. Quando un cliente scrive su WhatsApp, Messenger, Instagram o dal widget del sito, appare qui.'}
          </div>
        ) : vista === 'elenco' ? (
          conversazioni.map(riga)
        ) : (
          <div className="colonne-inbox">
            {colonne.map((col) => {
              const daLeggere = col.righe.reduce((s, c) => s + c.nonLetti, 0)
              return (
                <div className="colonna-inbox" key={col.nome}>
                  <div className="colonna-testata">
                    <span className="pallino" aria-hidden="true" />
                    <span className="nome">{col.nome}</span>
                    {daLeggere > 0 ? <span className="pill-nonletti">{daLeggere}</span> : null}
                    <span className="conteggio">{col.righe.length}</span>
                  </div>
                  <div className="corpo-colonna">
                    {col.righe.length === 0 ? (
                      <p className="colonna-vuota">Nessuna conversazione.</p>
                    ) : (
                      col.righe.map(riga)
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {aFinestra ? null : <div className="thread">{contenutoThread()}</div>}
    </div>

    {/* A colonne la conversazione si apre in una finestra sopra la bacheca:
        le colonne prendono tutta la larghezza e restano visibili sotto. */}
    {aFinestra && selezionata ? (
      <div className="velo" onClick={chiudiFinestra} role="presentation">
        <div
          className="pannello pannello-thread"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="thread">{contenutoThread()}</div>
        </div>
      </div>
    ) : null}
    </>
  )

  function contenutoThread() {
    return (
      <>
        {!selezionata ? (
          <div className="vuoto">Scegli una conversazione a sinistra.</div>
        ) : (
          <>
            <div className="testata-thread">
              <span
                className="nome"
                title={
                  selezionata.nomeRubrica
                    ? `In rubrica Google: ${selezionata.nomeRubrica}${selezionata.nome ? ` · sul profilo: ${selezionata.nome}` : ''}`
                    : undefined
                }
              >
                {selezionata.nomeRubrica || selezionata.nome || selezionata.idEsterno}
              </span>
              {selezionata.brand ? (
                <span className="badge" title="Il marchio di questa conversazione">
                  {selezionata.brand}
                </span>
              ) : null}
              {/* SU QUALE NOSTRO ACCOUNT è arrivata: la casella di posta, il
                  numero WhatsApp, il profilo Instagram. Prima si vedeva solo il
                  marchio, e con due caselle non si sapeva quale delle due aveva
                  ricevuto — che è la prima cosa da sapere per rispondere. */}
              {selezionata.etichettaAccount || selezionata.numeroNostro ? (
                <span
                  className="badge"
                  title="Il nostro account che ha ricevuto: la risposta parte da qui"
                >
                  ← {selezionata.etichettaAccount || selezionata.numeroNostro}
                </span>
              ) : null}
              {/* Il numero dell'ordine: è quello che ha deciso il marchio di
                  questa conversazione, e chi risponde lo cerca comunque. */}
              {selezionata.ordineNumero ? (
                <span className="badge" title="L'ordine di cui parla questa conversazione">
                  {selezionata.ordineNumero}
                </span>
              ) : null}
              <span className={`badge canale-${selezionata.canale}`}>
                {etichettaCanale(selezionata.canale)}
              </span>
              <span className="dettaglio">{selezionata.idEsterno}</span>

              <span className="azioni-thread">
                {/* Chi è questo numero: lo chiede alla rubrica Google, adesso.
                    Solo su WhatsApp — è l'unico canale con un telefono. */}
                {selezionata.canale === 'whatsapp' && !selezionata.nomeRubrica ? (
                  <button
                    className="bottone secondario mini"
                    onClick={cercaInRubrica}
                    disabled={cercandoRubrica}
                    title="Cerca questo numero nella rubrica Google collegata"
                  >
                    {cercandoRubrica ? 'Cerco…' : 'Rubrica'}
                  </button>
                ) : null}
                <button
                  className="bottone secondario mini"
                  onClick={() =>
                    cestino ? ripristina(selezionata.id) : archivia(selezionata.id, !archivio)
                  }
                  disabled={inCorsoTogli}
                  title={
                    cestino || archivio
                      ? 'Torna nella posta in arrivo'
                      : "Sparisce dall'elenco ma resta salvata"
                  }
                >
                  {cestino ? 'Ripristina' : archivio ? 'Riporta in inbox' : 'Archivia'}
                </button>
                <button
                  className="bottone secondario mini"
                  onClick={() => elimina(selezionata.id)}
                  disabled={inCorsoTogli}
                  style={{ color: 'var(--red)' }}
                  title={
                    cestino
                      ? 'Cancella per sempre, coi suoi messaggi'
                      : 'Sposta nel cestino: resta 30 giorni, poi si cancella'
                  }
                >
                  {cestino ? 'Cancella per sempre' : 'Elimina'}
                </button>
              </span>

              {aFinestra ? (
                <button
                  className="bottone secondario mini chiudi-finestra"
                  onClick={chiudiFinestra}
                  title="Chiudi (Esc)"
                >
                  Chiudi
                </button>
              ) : null}
            </div>

            <div className="messaggi">
              {messaggi.map((m) => (
                <Bolla key={m.id} m={m} canale={selezionata.canale} />
              ))}
              <div ref={fondoRef} />
            </div>

            {erroreInvio ? (
              <div className="avviso-errore" style={{ margin: '0 16px' }}>
                {erroreInvio}
              </div>
            ) : null}

            {suggerimento ? (
              <div className="avviso-ok" style={{ margin: '0 16px' }}>
                Da «{suggerimento.titolo}»: risposta pronta nel riquadro qui sotto, controllala
                prima di inviare.
              </div>
            ) : null}

            {/* Le risposte pronte, raggruppate per tipologia. Sta sopra il
                riquadro e non è una finestra: si legge la conversazione mentre
                si sceglie, che è esattamente quello che si fa. */}
            {risposteAperte ? (
              <div className="risposte-pronte">
                <input
                  autoFocus
                  placeholder="Cerca fra le risposte…"
                  value={cercaRisposta}
                  onChange={(e) => setCercaRisposta(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setRisposteAperte(false)
                  }}
                />
                <div className="elenco-risposte">
                  {(() => {
                    const q = cercaRisposta.trim().toLowerCase()
                    const trovate = risposte.filter(
                      (s) =>
                        !q ||
                        s.titolo.toLowerCase().includes(q) ||
                        s.categoria.toLowerCase().includes(q) ||
                        s.quando.toLowerCase().includes(q) ||
                        s.testo.toLowerCase().includes(q)
                    )
                    if (!trovate.length) {
                      return (
                        <p className="colonna-vuota">
                          {risposte.length
                            ? 'Nessuna risposta con queste parole.'
                            : 'Nessuna risposta pronta: si scrivono in Script.'}
                        </p>
                      )
                    }
                    // Raggruppate per tipologia, nell'ordine in cui arrivano da
                    // /api/script (categoria, poi le più usate).
                    const perCategoria = new Map<string, ScriptDto[]>()
                    for (const s of trovate) {
                      const gruppo = perCategoria.get(s.categoria) ?? []
                      gruppo.push(s)
                      perCategoria.set(s.categoria, gruppo)
                    }
                    return [...perCategoria].map(([categoria, righe]) => (
                      <div className="gruppo-risposte" key={categoria}>
                        <span className="tipologia">{categoria}</span>
                        {righe.map((s) => (
                          <button
                            key={s.id}
                            className="risposta"
                            onClick={() => usaRisposta(s)}
                            title={s.quando || 'Inserisce il testo nel riquadro'}
                          >
                            <span className="titolo">{s.titolo}</span>
                            <span className="anteprima-testo">{s.testo}</span>
                          </button>
                        ))}
                      </div>
                    ))
                  })()}
                </div>
              </div>
            ) : null}

            <div className="composer">
              <textarea
                ref={bozzaRef}
                rows={1}
                placeholder={`Rispondi su ${etichettaCanale(selezionata.canale)}…`}
                value={bozza}
                onChange={(e) => setBozza(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    invia()
                  }
                }}
              />
              {/* Sulle mail: la stessa risposta, ma scritta dal programma di
                  posta vero (allegati, formattazione, thread lungo). Quello che
                  parte da lì NON torna in questa conversazione — sta nel
                  titolino, così non lo si scopre dopo. */}
              {selezionata.canale === 'email' ? (
                <a
                  className="bottone secondario"
                  href={urlScriviAiMail({
                    a: selezionata.idEsterno,
                    oggetto: oggettoRisposta,
                    corpo: bozza,
                    rif: `conversazione con ${selezionata.nome || selezionata.idEsterno}`,
                  })}
                  target="_blank"
                  rel="noreferrer noopener"
                  title="Apre AI Mail con destinatario, oggetto e testo già compilati. La mail parte dalla casella collegata là e in questa conversazione non resta traccia."
                >
                  AI Mail
                </a>
              ) : null}
              {/* Le risposte pronte per tipologia: nessuna attesa e nessuna
                  scelta da indovinare. L'AI resta accanto, per i casi che
                  vanno capiti. */}
              <button
                className="bottone secondario"
                onClick={() => setRisposteAperte(!risposteAperte)}
                title="Le risposte pronte, per tipologia"
              >
                Risposte
              </button>
              {/* Allegati: per ora solo WhatsApp. Sugli altri canali il bottone
                  non c'è invece di esserci e fallire — Meta e SMTP vogliono
                  strade diverse. */}
              {selezionata.canale === 'whatsapp' ? (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) mandaFile(f)
                    }}
                  />
                  <button
                    className="bottone secondario"
                    onClick={() => fileRef.current?.click()}
                    disabled={caricando}
                    title="Manda una foto o un documento (max 4 MB). Il testo scritto qui diventa la didascalia."
                  >
                    {caricando ? 'Carico…' : 'Allega'}
                  </button>
                </>
              ) : null}
              {/* Risposta rapida: l'AI sceglie fra gli Script e adatta il testo.
                  Finisce nel riquadro, NON parte da sola: la si controlla prima. */}
              <button
                className="bottone secondario"
                onClick={suggerisci}
                disabled={suggerendo}
                title="Proponi una risposta partendo dagli Script"
              >
                {suggerendo ? 'Penso…' : 'Risposta rapida'}
              </button>
              <button className="bottone" onClick={invia} disabled={inviando || !bozza.trim()}>
                Invia
              </button>
            </div>
          </>
        )}
      </>
    )
  }
}
