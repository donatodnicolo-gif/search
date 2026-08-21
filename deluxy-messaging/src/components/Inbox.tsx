'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { pezziDiTesto, ripulisciTestoEmail } from '@/lib/testo-email'
import { inserisciScript } from '@/lib/script-testo'
import { urlScriviAiMail } from '@/lib/ai-mail'
import { NuovaMail } from './NuovaMail'
import { CollegaOrdine } from './CollegaOrdine'
import { RiassuntoChat } from './RiassuntoChat'
import { NOMI_ORIGINE } from '@/lib/provenienza'
import { nuoviDaAvvisare } from '@/lib/avvisi'

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
  /** Da dove arriva chi ha aperto la chat dal sito: google-ads, diretto, … */
  origine?: string
  origineDettaglio?: string
  paginaIngresso?: string
  /** Il numero dell'ordine di cui parla la conversazione, se lo sappiamo. */
  ordineNumero?: string
  /**
   * Chi se ne sta occupando. Vuoto = libera, e chiunque può prenderla.
   * ⚠️ `presaDaNome` è una **copia**: se l'account viene tolto resta scritto chi
   * ci stava lavorando invece di un id che non dice niente.
   */
  presaDaId?: string
  presaDaNome?: string
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
  /**
   * C'è un allegato Instagram/Messenger. È un **sì/no**, non l'indirizzo:
   * l'indirizzo che manda Meta è una chiave d'accesso alla foto di un cliente e
   * non ha motivo di arrivare nel browser — il file passa dalla nostra rotta.
   */
  haAllegato?: boolean
  mimeType?: string
  nomeFile?: string
  /** Chi ha scritto, solo in uscita. Vuoto sui messaggi vecchi: parte da ora. */
  utenteNome?: string
  /**
   * `testo` | `media` | `nota` | **`auto`**.
   *
   * `auto` è la risposta di primo contatto, partita da sola. Va distinta a
   * schermo: senza etichetta sembrerebbe scritta da un collega di cui non si
   * legge il nome, e chi riprende la conversazione non saprebbe se una persona
   * ha già detto qualcosa al cliente.
   */
  tipo?: string
  /** La lingua in cui è scritto ("inglese", "francese"…). Vuoto = non si sa. */
  lingua?: string
  /** La traduzione in italiano, se è arrivato in una lingua che non leggiamo. */
  traduzione?: string
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

/**
 * Quando è stato mandato o ricevuto un messaggio: **sempre con l'ora**.
 *
 * ⚠️ Diverso da `oraBreve`, che sulla RIGA dell'elenco mostra solo il giorno
 * quando non è oggi: lì lo spazio è quello di una parola. Dentro la
 * conversazione l'ora è il dato che si cerca — «gliel'ho scritto alle 9, ha
 * risposto alle 14» è la storia di un reclamo, «19 ago» non dice niente.
 */
function oraMessaggio(iso: string): string {
  const d = new Date(iso)
  const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === new Date().toDateString()) return ora
  const giorno = d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
  return giorno + ' · ' + ora
}

/**
 * Il nome di battesimo di chi ha preso in carico, per il bollino sulla riga.
 *
 * ⚠️ Sulla riga c'è spazio per una parola: «Federica» si legge, «Federica
 * Zicchinella» spinge fuori l'anteprima del messaggio, che è quello che si sta
 * leggendo davvero. Il nome intero resta nel `title` e nella testata del thread.
 * Se l'account fosse stato registrato con la sola email, si mostra la parte
 * prima della chiocciola invece di un indirizzo lungo.
 */
function primoNome(nome?: string): string {
  const pulito = (nome ?? '').trim()
  if (!pulito) return 'Preso'
  return (pulito.includes('@') ? pulito.split('@')[0] : pulito).split(/\s+/)[0]
}

/** Oltre questa lunghezza la bolla si chiude: una mail intera è un muro. */
const LIMITE_TESTO = 900

// Una bolla del thread. Le mail arrivano lunghissime e piene di link di
// tracciamento: qui si mostrano ripulite, accorciate e coi link ridotti al
// nome del sito. Il testo com'era arrivato resta a un clic di distanza.
function Bolla({ m, canale }: { m: MessaggioDto; canale: string }) {
  const [tutto, setTutto] = useState(false)
  const [grezzo, setGrezzo] = useState(false)
  // ⚠️ Quando c'è la traduzione si parte da QUELLA, non dall'originale: chi apre
  // una conversazione in olandese deve capirla al primo sguardo, non dopo aver
  // trovato un bottone. L'originale resta a un clic — è lui la prova di cosa ha
  // scritto il cliente, e su una data o un indirizzo si controlla lì.
  const [originale, setOriginale] = useState(false)
  const tradotto = Boolean(m.traduzione) && !originale

  // Solo le mail si ripuliscono: su WhatsApp e widget il cliente scrive a mano
  // e quello che manda va letto com'è.
  const pulito = useMemo(
    () => (canale === 'email' ? ripulisciTestoEmail(m.testo) : m.testo),
    [canale, m.testo]
  )
  const testo = tradotto ? (m.traduzione as string) : grezzo ? m.testo : pulito
  const tagliato = !tutto && testo.length > LIMITE_TESTO
  const visibile = tagliato ? `${testo.slice(0, LIMITE_TESTO).trimEnd()}…` : testo
  const pezzi = useMemo(() => (grezzo ? null : pezziDiTesto(visibile)), [grezzo, visibile])

  const accorciaLink = pezzi?.some((p) => p.tipo === 'link' && p.etichetta !== p.url) ?? false
  const cambiato = pulito !== m.testo || accorciaLink

  // L'allegato viene prima del testo: quando c'è una foto, il testo è la sua
  // didascalia. Il file non è nostro — lo tiene Meta — e `/api/media/[id]` fa
  // da ponte col token giusto.
  // ⚠️ Due sorgenti, una sola rotta: su WhatsApp l'allegato è un `mediaId` da
  // chiedere a Meta, su Instagram e Messenger un indirizzo già firmato
  // (`haAllegato`). Il browser non deve conoscere la differenza — passa sempre
  // da `/api/media/[id]`, che sceglie la strada giusta.
  const allegato = m.mediaId || m.haAllegato ? `/api/media/${m.id}` : ''
  const eFoto = (m.mimeType ?? '').startsWith('image/')
  // Col file davanti, un testo tipo «[image]» o il nome del file è rumore: è
  // già scritto sopra. Una didascalia vera invece si mostra.
  // ⚠️ Restano anche le etichette italiane che scriviamo noi quando il cliente
  // manda solo una foto («Foto», «Video»): col file a schermo, ripeterle sotto
  // è dire due volte la stessa cosa.
  const ETICHETTE_NOSTRE = ['foto', 'video', 'messaggio vocale', 'file', 'allegato', 'reel']
  const testoInutile =
    Boolean(allegato) &&
    (/^\[[^\]]+\]$/.test(m.testo.trim()) ||
      m.testo.trim() === m.nomeFile ||
      ETICHETTE_NOSTRE.includes(m.testo.trim().toLowerCase()))
  // Senza allegato, «[image]» da solo non è un testo del cliente: è il segnaposto
  // che lasciava il vecchio webhook, e al suo posto va l'avviso qui sotto.
  const soloSegnaposto =
    !allegato && /^\[(image|video|audio|file|sticker)\]$/i.test(m.testo.trim())

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
      {/* ⚠️ Il buco dichiarato: fino al 17/08/2026 il webhook di Instagram e
          Messenger buttava via l'indirizzo dell'allegato e scriveva «[image]».
          Quelle foto non si recuperano — non ne esiste una copia. Dirlo per
          quello che è evita che chi legge pensi che l'app non le mostri e
          continui a cercare un bottone che non c'è. */}
      {soloSegnaposto ? (
        <span className="allegato-perso">
          Allegato non salvato — arrivato prima del 17/08/2026. Si vede solo nell’app di
          Instagram o Messenger.
        </span>
      ) : null}
      {testoInutile || soloSegnaposto ? null : pezzi ? (
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
      {tagliato || tutto || cambiato || m.traduzione ? (
        <span className="azioni-testo">
          {/* Da che lingua viene: si dice sempre, perché un testo tradotto
              letto come originale è un testo di cui ci si fida troppo. */}
          {m.traduzione ? (
            <button
              type="button"
              onClick={() => setOriginale(!originale)}
              title={
                originale
                  ? 'Torna alla traduzione italiana'
                  : `Il messaggio com'è arrivato${m.lingua ? `, in ${m.lingua}` : ''}`
              }
            >
              {originale
                ? 'Traduzione'
                : `Originale${m.lingua ? ` (${m.lingua})` : ''}`}
            </button>
          ) : null}
          {tagliato || tutto ? (
            <button type="button" onClick={() => setTutto(!tutto)}>
              {tutto ? 'Mostra meno' : 'Mostra tutto'}
            </button>
          ) : null}
          {/* Mentre si legge la traduzione, «testo grezzo» non vuol dire niente:
              i due bottoni uno accanto all'altro sembrerebbero la stessa cosa. */}
          {cambiato && !tradotto ? (
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
        {oraMessaggio(m.creatoIl)}
        {/* Chi ha risposto: quando la conversazione passa di mano è la
            prima cosa che si cerca. Vuoto sui messaggi vecchi. */}
        {m.direzione === 'out' && m.tipo === 'auto'
          ? ' · risposta automatica'
          : m.direzione === 'out' && m.utenteNome
            ? ` · ${m.utenteNome}`
            : ''}
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

/** Spam: il segnale di divieto, che si legge senza doverci pensare. */
function IconaSpam() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" />
      <path d="M4.1 4.1l7.8 7.8" />
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
  ioId = '',
  ioNome = '',
}: {
  conversazioniIniziali: ConversazioneDto[]
  /** I marchi che POSSONO ricevere (numeri WhatsApp e account Meta collegati):
   *  la loro colonna si vede anche vuota, altrimenti «zero messaggi oggi»
   *  sembrerebbe «marchio non configurato». */
  brandNoti?: string[]
  /** Chi sta guardando l'inbox: serve a dire «io» invece di ripetere il suo nome. */
  ioId?: string
  ioNome?: string
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
  const contenitoreRef = useRef<HTMLDivElement>(null)
  // Lingua e traduzione della conversazione aperta: le decide il server, che è
  // l'unico a sapere quali lingue leggiamo (impostazione).
  const [daTradurre, setDaTradurre] = useState(false)
  const [traduzioneAuto, setTraduzioneAuto] = useState(false)
  const [linguaCliente, setLinguaCliente] = useState('')
  const [traducendo, setTraducendo] = useState(false)

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
  /**
   * Quanti non letti aveva OGNI conversazione al giro precedente.
   *
   * `null` = primo caricamento, e allora non si suona niente. Una mappa e non
   * una somma: vedi il commento dell'effetto più sotto.
   */
  const nonLettiPerConversazione = useRef<Map<string, number> | null>(null)

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
    (quante: number, libere: boolean) => {
      if (!avvisi || typeof Notification === 'undefined') return
      if (Notification.permission !== 'granted') return
      if (typeof document !== 'undefined' && !document.hidden) return
      try {
        const n = new Notification(
          quante === 1 ? 'Nuovo messaggio' : `${quante} nuovi messaggi`,
          {
            // Le due righe dicono cose diverse perché richiedono cose diverse:
            // su una conversazione MIA la risposta la devo io, su una LIBERA il
            // rischio è che non la dia nessuno.
            body: libere
              ? 'Deluxy Customer Service — nessuno se ne sta ancora occupando.'
              : 'Deluxy Customer Service — su una conversazione di cui ti stai occupando.',
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

  // Chi viene avvisato e per cosa lo decide `nuoviDaAvvisare` (src/lib/avvisi.ts):
  // mie e libere sì, quelle di un collega no. La regola sta in libreria perché
  // si prova con dei casi, senza aprire un browser — qui resta solo il quando.
  useEffect(() => {
    if (vistaElenco !== 'arrivo') return
    const ora = new Map(conversazioni.map((c) => [c.id, c.nonLetti]))
    const prima = nonLettiPerConversazione.current
    nonLettiPerConversazione.current = ora
    // Al primo caricamento non si suona: aprire l'inbox con 106 non letti non è
    // un messaggio appena arrivato.
    if (!prima) return

    const { quanti, daLibere } = nuoviDaAvvisare(prima, conversazioni, ioId)
    if (quanti > 0) {
      suona()
      avvisa(quanti, daLibere)
    }
  }, [conversazioni, vistaElenco, suona, avvisa, ioId])

  const caricaMessaggi = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/conversazioni/${id}/messaggi`)
      if (!res.ok) return
      const dati = (await res.json()) as {
        messaggi: MessaggioDto[]
        traduzioneAuto?: boolean
        daTradurre?: boolean
        linguaCliente?: string
      }
      setMessaggi(dati.messaggi)
      setDaTradurre(Boolean(dati.daTradurre))
      setTraduzioneAuto(Boolean(dati.traduzioneAuto))
      setLinguaCliente(dati.linguaCliente ?? '')
      // aprire il thread azzera i non letti anche in locale
      setConversazioni((prec) => prec.map((c) => (c.id === id ? { ...c, nonLetti: 0 } : c)))
    } catch {
      // rete assente: si ritenta al giro dopo
    }
  }, [])

  /**
   * Traduce in italiano i messaggi arrivati in una lingua che non leggiamo.
   *
   * ⚠️ Non si traduce nel webhook — una chiamata a OpenAI dentro il percorso che
   * riceve i messaggi manda Meta in timeout, cioè fa PERDERE messaggi — quindi
   * si traduce qui, all'apertura: è il momento in cui serve, ed è normale
   * aspettare un secondo.
   */
  const traduciArrivati = useCallback(
    async (id: string) => {
      if (traducendo) return
      setTraducendo(true)
      try {
        const res = await fetch(`/api/conversazioni/${id}/traduci`, { method: 'POST' })
        const d = (await res.json().catch(() => ({}))) as { tradotti?: number; errore?: string }
        if (d.errore && !d.tradotti) setErroreInvio(`Traduzione: ${d.errore}`)
        if (d.tradotti) await caricaMessaggi(id)
        else setDaTradurre(false)
      } catch {
        // rete assente: resta il testo originale, che è comunque leggibile
      } finally {
        setTraducendo(false)
      }
    },
    [caricaMessaggi, traducendo]
  )

  /** Traduce la bozza verso la lingua del cliente. Non invia: riempie il riquadro. */
  const traduciBozza = useCallback(
    async (verso: string) => {
      const testo = bozza.trim()
      if (!testo || !selezionataId || traducendo) return
      setTraducendo(true)
      setErroreInvio('')
      try {
        const res = await fetch(`/api/conversazioni/${selezionataId}/traduci`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ verso, testo }),
        })
        const d = (await res.json().catch(() => ({}))) as { testo?: string; errore?: string }
        if (!res.ok || !d.testo) {
          setErroreInvio(d.errore || 'Traduzione non riuscita.')
          return
        }
        setBozza(d.testo)
      } catch {
        setErroreInvio('Traduzione non riuscita: problema di rete.')
      } finally {
        setTraducendo(false)
      }
    },
    [bozza, selezionataId, traducendo]
  )

  // Traduzione all'apertura, se è accesa in Impostazioni. `daTradurre` lo decide
  // il server: qui non si sa quali lingue leggiamo, e chiedere una traduzione
  // che non serve è una chiamata pagata a ogni apertura.
  useEffect(() => {
    if (!selezionataId || !traduzioneAuto || !daTradurre) return
    traduciArrivati(selezionataId)
  }, [selezionataId, traduzioneAuto, daTradurre, traduciArrivati])

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

  // ⚠️ Le chat si aprono in fondo, le MAIL no.
  //
  // Andare sempre in fondo è la regola giusta per WhatsApp, dove i messaggi sono
  // corti e l'ultimo è quello che conta. Su una mail lunga invece la coda è la
  // firma e il testo citato («On Mon, Jul 27… wrote: > Hey Deluxy Flowers»): si
  // apriva lì, cioè sulla parte che non serve a nessuno, e per leggere quello
  // che il cliente ha scritto bisognava risalire ogni volta.
  //
  // Quindi: se l'ultimo messaggio NON ci sta tutto nello spazio visibile, ci si
  // mette sul suo INIZIO; se ci sta, si va in fondo come prima — lo si vede
  // comunque intero, e la chat resta una chat.
  useEffect(() => {
    const contenitore = contenitoreRef.current
    if (!contenitore) return
    const ultimo = contenitore.children[messaggi.length - 1] as HTMLElement | undefined
    if (ultimo && ultimo.getBoundingClientRect().height > contenitore.clientHeight) {
      // getBoundingClientRect invece di offsetTop: non dipende da quale
      // antenato sia posizionato, che è una cosa che si cambia dal CSS senza
      // sapere che qui sotto qualcuno la stava usando per contare.
      const dislivello =
        ultimo.getBoundingClientRect().top - contenitore.getBoundingClientRect().top
      contenitore.scrollTop += dislivello - 8
      return
    }
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

  // ── «Solo ordini» ──
  //
  // Nella colonna Deluxy ci sono 85 conversazioni e 107 non letti, quasi tutte
  // newsletter e piattaforme: il lavoro vero — «Ordine #1742», «Re: Order #2599
  // confirmed» — sta in mezzo e si perde. Questo filtro tiene solo le
  // conversazioni per cui sappiamo il numero d'ordine, o che lo citano nel testo.
  //
  // ⚠️ Non è un antispam e non prova a essere furbo: non indovina se una mail è
  // pubblicità, mostra quelle che parlano di un ordine. Le chat dei clienti
  // restano sempre, perché una persona che scrive su WhatsApp non è mai rumore
  // anche quando non nomina un ordine.
  const [soloOrdini, setSoloOrdini] = useState(false)
  const CANALI_PERSONA = ['whatsapp', 'messenger', 'instagram', 'widget']

  // ── «Mie» e «Libere» ──
  //
  // Le due domande vere di chi si siede all'inbox in tre: *cosa sto seguendo io*
  // e *cosa non sta seguendo nessuno*. La seconda è la più importante — è lì che
  // stanno i clienti che rischiano di non ricevere risposta da nessuno, che è il
  // guaio opposto a quello delle risposte doppie.
  const [filtroPresa, setFiltroPresa] = useState<'tutte' | 'mie' | 'libere'>('tutte')

  const visibili = useMemo(() => {
    let righe = conversazioni
    if (soloOrdini) {
      righe = righe.filter(
        (c) =>
          CANALI_PERSONA.includes(c.canale) ||
          Boolean(c.ordineNumero) ||
          /#\d{3,7}\b/.test(c.ultimoTesto)
      )
    }
    if (filtroPresa === 'mie') righe = righe.filter((c) => c.presaDaId && c.presaDaId === ioId)
    if (filtroPresa === 'libere') righe = righe.filter((c) => !c.presaDaId)
    return righe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversazioni, soloOrdini, filtroPresa, ioId])

  // I numeri sulle linguette: «Libere 7» dice se vale la pena guardarci prima
  // ancora di cliccare. Si contano sull'elenco intero, non su quello filtrato.
  const quanteMie = useMemo(
    () => conversazioni.filter((c) => c.presaDaId && c.presaDaId === ioId).length,
    [conversazioni, ioId]
  )
  const quanteLibere = useMemo(
    () => conversazioni.filter((c) => !c.presaDaId).length,
    [conversazioni]
  )

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
      righe: visibili.filter((c) => marchioDi(c) === nome),
    }))
    const orfane = visibili.filter((c) => marchioDi(c) === SENZA_MARCHIO)
    if (orfane.length) gruppi.push({ nome: SENZA_MARCHIO, righe: orfane })
    return gruppi
  }, [brandNoti, visibili, marchioDi])

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

  // ── Segnala come spam ──
  //
  // Un clic al posto del giro «apri /caselle → copia l'indirizzo → incolla →
  // salva → torna in inbox → archivia». Il meccanismo dei mittenti ignorati
  // c'era già: mancava il modo di usarlo nel momento in cui si vede la mail,
  // che è l'unico in cui uno lo farebbe davvero.
  async function segnalaSpam(id: string) {
    const c = conversazioni.find((x) => x.id === id)
    if (!c) return
    if (c.canale !== 'email') {
      setErroreInvio(
        'Lo spam si segnala sulla posta: su WhatsApp o Instagram il blocco si fa da lì. Qui puoi archiviare.'
      )
      return
    }
    // ⚠️ La conferma dice l'INDIRIZZO ESATTO che sta per essere bloccato, non
    // «questo mittente»: è l'unico momento in cui si può accorgersi che è
    // l'indirizzo di un cliente vero. E dice dove si torna indietro — un blocco
    // senza una via d'uscita visibile non lo usa nessuno.
    if (
      !window.confirm(
        `Le prossime mail da ${c.idEsterno} entreranno già archiviate, e questa va in archivio adesso.\n\n` +
          'Non si cancella niente e si può togliere dalla pagina Caselle. Procedo?'
      )
    ) {
      return
    }
    if (inCorsoTogli) return
    setInCorsoTogli(true)
    try {
      const res = await fetch(`/api/conversazioni/${id}/spam`, { method: 'POST' })
      const dati = (await res.json().catch(() => ({}))) as { errore?: string; giaCera?: boolean }
      if (!res.ok) {
        setErroreInvio(dati.errore || 'Segnalazione non riuscita.')
        return
      }
      togliDallElenco(id)
      setQuanteArchiviate((n) => n + 1)
      setErroreInvio(
        dati.giaCera
          ? `${c.idEsterno} era già fra i mittenti ignorati: la conversazione è archiviata.`
          : `${c.idEsterno} non arriverà più in posta in arrivo.`
      )
    } catch {
      setErroreInvio('Segnalazione non riuscita: problema di rete.')
    } finally {
      setInCorsoTogli(false)
    }
  }

  // ── Prendere in carico ──
  //
  // ⚠️ Non è un lucchetto: segnala, non blocca. Chi prende una conversazione non
  // impedisce a nessuno di rispondere — in un servizio clienti un blocco vero si
  // ritorce sul cliente (chi l'ha presa va a pranzo e nessun altro può
  // risponderle). Quello che serve è che si SAPPIA, e si sa da qui.
  const [inCorsoPresa, setInCorsoPresa] = useState('')

  async function prendiInCarico(id: string, presa: 'io' | 'nessuno', forza = false) {
    if (inCorsoPresa) return
    setInCorsoPresa(id)
    // Ottimistico: il badge cambia subito, perché è un gesto che si fa mentre si
    // legge e aspettare mezzo secondo lo fa sembrare rotto.
    const prima = conversazioni.find((c) => c.id === id)
    const dopo =
      presa === 'io' ? { presaDaId: ioId, presaDaNome: ioNome } : { presaDaId: '', presaDaNome: '' }
    setConversazioni((elenco) => elenco.map((c) => (c.id === id ? { ...c, ...dopo } : c)))
    try {
      const res = await fetch(`/api/conversazioni/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presa, forza }),
      })
      if (!res.ok) {
        // ⚠️ IL RITORNO INDIETRO È OBBLIGATORIO. Un'interfaccia ottimistica che
        // non sa disfare mostra il proprio nome su una conversazione che il
        // server ha assegnato a un altro: due operatori convinti di averla presa
        // sono peggio di nessuno dei due.
        if (prima) {
          setConversazioni((elenco) =>
            elenco.map((c) =>
              c.id === id
                ? { ...c, presaDaId: prima.presaDaId ?? '', presaDaNome: prima.presaDaNome ?? '' }
                : c
            )
          )
        }
        const dati = (await res.json().catch(() => ({}))) as { errore?: string; occupata?: boolean }
        if (dati.occupata) {
          // Se l'ha presa un altro mentre stavamo leggendo, non si insiste da
          // soli: si chiede. Prenderla comunque resta possibile — capita che chi
          // l'aveva presa sia proprio la persona che ti ha chiesto di occupartene.
          if (window.confirm(`${dati.errore} Vuoi prenderla comunque tu?`)) {
            setInCorsoPresa('')
            await prendiInCarico(id, 'io', true)
            return
          }
        } else {
          setErroreInvio(dati.errore || 'Non è riuscito a cambiare chi se ne occupa.')
        }
        return
      }
    } catch {
      if (prima) {
        setConversazioni((elenco) =>
          elenco.map((c) =>
            c.id === id
              ? { ...c, presaDaId: prima.presaDaId ?? '', presaDaNome: prima.presaDaNome ?? '' }
              : c
          )
        )
      }
      setErroreInvio('Non è riuscito a cambiare chi se ne occupa: problema di rete.')
    } finally {
      setInCorsoPresa('')
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

  /**
   * Le risposte che corrispondono a quello che si sta cercando.
   *
   * Sta qui e non dentro l'elenco perché la usa anche l'Invio dalla casella di
   * ricerca: due filtri scritti due volte diventano due elenchi diversi al
   * primo ritocco, e l'Invio sceglierebbe una riga che non è quella in cima.
   */
  const risposteFiltrate = useCallback(() => {
    const q = cercaRisposta.trim().toLowerCase()
    return risposte.filter(
      (s) =>
        !q ||
        s.titolo.toLowerCase().includes(q) ||
        s.categoria.toLowerCase().includes(q) ||
        s.quando.toLowerCase().includes(q) ||
        s.testo.toLowerCase().includes(q)
    )
  }, [cercaRisposta, risposte])
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

  // La finestra «Nuovo messaggio»: per ora solo posta. Su WhatsApp scrivere per
  // primi fuori dalle 24 ore vuole un modello approvato da Meta, quindi è un
  // lavoro a parte e non un campo in più in questa finestra.
  const [nuovaMail, setNuovaMail] = useState(false)
  /** Il pop-up per collegare la conversazione a un ordine. */
  const [collegaAperto, setCollegaAperto] = useState(false)

  /**
   * I numeri d'ordine **scritti dentro la conversazione**.
   *
   * ⚠️ Quasi sempre la risposta è già lì: il cliente incolla la conferma
   * («Ordine #2759 confermato») o cita il numero scrivendo. Chiedere di
   * cercarlo a mano quando è tre righe più su è il lavoro che l'app dovrebbe
   * togliere, non dare.
   *
   * ⚠️ Si prendono solo le forme che dichiarano un ordine — «#2759», «ordine
   * 2759», «ordine n. 2759» — e non un numero qualsiasi: in una chat girano
   * civici, CAP, orari e importi, e proporre «20128» come ordine manderebbe a
   * collegare la conversazione sbagliata.
   */
  const numeriCitati = useMemo(() => {
    const trovati = new Set<string>()
    for (const m of messaggi) {
      const testo = m.testo || ''
      for (const r of [/#\s?(\d{3,6})\b/g, /\bordin[ei]\s+(?:n\.?\s*)?#?\s?(\d{3,6})\b/gi]) {
        for (const trovato of testo.matchAll(r)) trovati.add('#' + trovato[1])
      }
    }
    return [...trovati].slice(0, 6)
  }, [messaggi])

  /**
   * Collega la conversazione a un ordine (numero vuoto = scollega).
   *
   * ⚠️ L'elenco si ricarica dopo: il numero d'ordine si legge anche dalla riga
   * in inbox, e lasciarlo indietro vorrebbe dire due schermate che dicono cose
   * diverse sulla stessa conversazione.
   */
  async function collegaOrdine(numero: string) {
    if (!selezionataId) return
    try {
      const res = await fetch(`/api/conversazioni/${selezionataId}/ordine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok) {
        setErroreInvio(d.errore || 'Collegamento non riuscito.')
        return
      }
      setCollegaAperto(false)
      await aggiornaConversazioni()
    } catch {
      setErroreInvio('Collegamento non riuscito: problema di rete.')
    }
  }
  // Il pannello del riassunto: chiuso di suo. Aprirlo mostra quello gia' salvato,
  // rifarlo e' un gesto in piu' — l'AI non si scomoda da sola.
  const [riassuntoAperto, setRiassuntoAperto] = useState(false)

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
          {/* Chi se ne sta occupando. Si mostra SOLO quando qualcuno l'ha
              presa: un bollino «libera» su ogni riga sarebbe rumore su rumore,
              e l'informazione qui è che una riga è già di qualcuno. */}
          {c.presaDaId ? (
            <span
              className={`badge badge-presa${c.presaDaId === ioId ? ' mia' : ''}`}
              title={
                c.presaDaId === ioId
                  ? 'Te ne stai occupando tu'
                  : `Se ne sta occupando ${c.presaDaNome || 'un altro operatore'}`
              }
            >
              {c.presaDaId === ioId ? 'Io' : primoNome(c.presaDaNome)}
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
          {/* Spam: solo sulla posta in arrivo e solo sulle mail. Sugli altri
              canali l'elenco dei mittenti ignorati non viene nemmeno letto, e
              un bottone che non fa quello che promette è peggio di nessun
              bottone — chi lo preme smette di controllare. */}
          {!archivio && !cestino && c.canale === 'email' ? (
            <button
              aria-label="Segnala come spam"
              title={`Segnala come spam: le prossime mail da ${c.idEsterno} entreranno già archiviate`}
              onClick={(e) => {
                e.stopPropagation()
                segnalaSpam(c.id)
              }}
              disabled={inCorsoTogli}
            >
              <IconaSpam />
            </button>
          ) : null}
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
          {/* Scrivere per primi: prima si poteva solo rispondere, e per un
              cliente che non aveva mai scritto bisognava uscire dall'app. */}
          <button className="bottone mini" onClick={() => setNuovaMail(true)}>
            Nuovo messaggio
          </button>
          <button className="bottone secondario mini" onClick={scaricaPosta} disabled={scaricoPosta === '…'}>
            {scaricoPosta === '…' ? 'Scarico posta…' : 'Scarica posta'}
          </button>
          {scaricoPosta && scaricoPosta !== '…' ? (
            <span className="esito">{scaricoPosta}</span>
          ) : null}
          {/* «Mie» e «Libere»: in tre sulla stessa inbox, sono le due domande
              che ci si fa sedendosi. «Libere» conta più di «Mie» — è dove stanno
              i clienti che rischiano di non ricevere risposta da nessuno. */}
          <span className="linguette" style={{ marginLeft: 'auto' }}>
            <button
              className={filtroPresa === 'tutte' ? 'attiva' : ''}
              onClick={() => setFiltroPresa('tutte')}
              title="Tutte le conversazioni, prese e non"
            >
              Tutte
            </button>
            <button
              className={filtroPresa === 'mie' ? 'attiva' : ''}
              onClick={() => setFiltroPresa('mie')}
              title="Quelle di cui ti stai occupando tu"
            >
              Mie{quanteMie ? ` ${quanteMie}` : ''}
            </button>
            <button
              className={filtroPresa === 'libere' ? 'attiva' : ''}
              onClick={() => setFiltroPresa('libere')}
              title="Quelle che non sta seguendo nessuno: è qui che si rischia di lasciare un cliente senza risposta"
            >
              Libere{quanteLibere ? ` ${quanteLibere}` : ''}
            </button>
          </span>
          {/* «Solo ordini»: mostra le conversazioni che parlano di un ordine e le
              chat delle persone. Non è un antispam — non indovina se una mail è
              pubblicità — ma è quello che serve per lavorare. */}
          <button
            className={`bottone ${soloOrdini ? '' : 'secondario '}mini`}
            onClick={() => setSoloOrdini(!soloOrdini)}
            title={
              soloOrdini
                ? 'Stai vedendo solo ordini e chat: premi per rivedere tutto'
                : 'Mostra solo le conversazioni che parlano di un ordine, più le chat'
            }
          >
            {soloOrdini ? 'Solo ordini' : 'Tutto'}
          </button>
          {/* Il suono si può spegnere: in una stanza con tre operatori, tre
              campanelli sullo stesso messaggio sono rumore. */}
          <button
            className="bottone secondario mini"
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
                ? 'Avvisi attivi: compaiono quando la scheda non è in primo piano, e solo per le conversazioni tue o ancora libere — non per quelle prese da un collega'
                : 'Chiedi al browser di mostrare un avviso quando arriva un messaggio su una conversazione tua o ancora libera'
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

        {visibili.length === 0 ? (
          <div className="vuoto" style={{ padding: 30 }}>
            {cestino
              ? 'Cestino vuoto. Quello che elimini finisce qui e ci resta 30 giorni: poi si cancella da solo, coi suoi messaggi.'
              : archivio
                ? 'Archivio vuoto. Le conversazioni che archivi finiscono qui, e da qui si riportano indietro.'
                : 'Nessuna conversazione ancora. Quando un cliente scrive su WhatsApp, Messenger, Instagram o dal widget del sito, appare qui.'}
          </div>
        ) : vista === 'elenco' ? (
          visibili.map(riga)
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
    {/* Il pop-up per scegliere l'ordine: si apre col nome del cliente già
        scritto nella ricerca, perché nove volte su dieci l'ordine è suo. */}
    {collegaAperto && selezionata ? (
      <CollegaOrdine
        collegato={selezionata.ordineNumero}
        citati={numeriCitati}
        suggerimento={selezionata.nome || selezionata.idEsterno}
        onScegli={(numero) => void collegaOrdine(numero)}
        onChiudi={() => setCollegaAperto(false)}
      />
    ) : null}
    {nuovaMail ? (
      <NuovaMail
        onChiudi={() => setNuovaMail(false)}
        onInviata={() => {
          setNuovaMail(false)
          // L'elenco si ricarica: la conversazione appena creata deve comparire
          // subito, altrimenti sembra che il messaggio non sia partito.
          aggiornaConversazioni()
        }}
      />
    ) : null}

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
              {/* ── Collega a un ordine ──
                  L'aggancio automatico prende il caso facile: il cliente cita
                  il numero, o scrive dalla mail dell'ordine. Tutti gli altri —
                  «buongiorno, per la consegna di domani» da un altro indirizzo
                  — restavano senza, e chi risponde si cercava l'ordine a mano
                  **ogni volta** che riapriva il thread.
                  ⚠️ Il bottone c'è anche quando il collegamento esiste: serve a
                  cambiarlo o a toglierlo, e un aggancio sbagliato fa leggere la
                  conversazione col contesto di un altro cliente. */}
              {/* ── Fare l'ordine mentre si parla col cliente ──
                  Il caso è quello di tutti i giorni: «mi mandi un bouquet per
                  domani?». Finora si usciva dall'app, si apriva Shopify e si
                  ricopiavano nome, telefono e indirizzo — con la conversazione
                  chiusa alle spalle e il rischio di sbagliare una cifra.
                  ⚠️ Si apre in una SCHEDA NUOVA: la conversazione resta aperta,
                  perché mentre si compila l'ordine si continua a leggere quello
                  che il cliente ha scritto (indirizzo, orari, il biglietto).
                  ⚠️ Email e telefono si passano dal canale giusto: su una mail
                  `idEsterno` è l'indirizzo, su WhatsApp è il numero — scambiarli
                  vorrebbe dire un ordine con il telefono nel campo email. */}
              <a
                className="bottone secondario mini"
                href={`/nuovo-ordine?${new URLSearchParams({
                  nome: selezionata.nomeRubrica || selezionata.nome || '',
                  email: selezionata.canale === 'email' ? selezionata.idEsterno : '',
                  telefono: selezionata.canale === 'whatsapp' ? selezionata.idEsterno : '',
                }).toString()}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Fai un ordine per questo cliente: si apre in una scheda nuova, con nome e recapito già compilati"
              >
                Nuovo ordine ↗
              </a>
              <button
                className="bottone secondario mini"
                onClick={() => setCollegaAperto(true)}
                title={
                  selezionata.ordineNumero
                    ? `Collegata a ${selezionata.ordineNumero}: cambia o togli`
                    : 'Collega questa conversazione a un ordine'
                }
              >
                {selezionata.ordineNumero ? 'Cambia ordine' : 'Collega a un ordine'}
              </button>
              <span className={`badge canale-${selezionata.canale}`}>
                {etichettaCanale(selezionata.canale)}
              </span>
              {/* ── Chi se ne occupa, e il bottone per cambiarlo ──
                  Sta nella testata e non fra le azioni in fondo: è la cosa da
                  sapere PRIMA di cominciare a scrivere, non dopo. */}
              {selezionata.presaDaId && selezionata.presaDaId !== ioId ? (
                <span className="badge badge-presa" title="Se ne sta già occupando un collega">
                  {selezionata.presaDaNome || 'Un altro operatore'}
                </span>
              ) : null}
              <button
                className={`bottone ${selezionata.presaDaId === ioId ? 'secondario ' : ''}mini`}
                disabled={inCorsoPresa === selezionata.id}
                onClick={() =>
                  prendiInCarico(
                    selezionata.id,
                    selezionata.presaDaId === ioId ? 'nessuno' : 'io'
                  )
                }
                title={
                  selezionata.presaDaId === ioId
                    ? 'La lasci libera: sparisce da «Mie» e chiunque può prenderla'
                    : selezionata.presaDaId
                      ? 'Prendila tu: te lo chiede una conferma, perché ce l’ha già un collega'
                      : 'Segnala ai colleghi che te ne stai occupando tu'
                }
              >
                {selezionata.presaDaId === ioId ? 'Lascia' : 'Me ne occupo io'}
              </button>
              {/* ⚠️ CHI SCRIVE, in chiaro. Su WhatsApp `idEsterno` è il numero
                  vero del cliente (Meta lo manda senza «+»), ed è il dato che
                  serve per chiamarlo, cercarlo negli ordini o salvarlo in
                  rubrica. Prima era un testo grigio che, appena la testata si
                  riempiva, si accorciava fino a sparire: c'era e non si vedeva.
                  Su email è l'indirizzo, su Messenger e Instagram un id interno
                  che non vuol dire niente a nessuno — quello resta piccolo. */}
              {selezionata.canale === 'whatsapp' && selezionata.idEsterno ? (
                <a
                  className="numero-cliente"
                  href={`tel:+${selezionata.idEsterno.replace(/\D/g, '')}`}
                  title="Il numero da cui scrive: cliccalo per chiamarlo"
                >
                  +{selezionata.idEsterno.replace(/\D/g, '')}
                </a>
              ) : (
                <span className="dettaglio">{selezionata.idEsterno}</span>
              )}

              {/* In che lingua ci ha scritto: è il dato che decide in che lingua
                  gli si risponde, e va visto senza doverlo dedurre dal testo. */}
              {linguaCliente && linguaCliente !== 'italiano' ? (
                <span className="badge" title="La lingua in cui scrive il cliente: la risposta AI esce in questa lingua">
                  {linguaCliente}
                </span>
              ) : null}

              <span className="azioni-thread">
                <button
                  className="bottone secondario mini"
                  onClick={() => setRiassuntoAperto(!riassuntoAperto)}
                  title="Data, ora, luogo e prodotto detti dal cliente, con la frase da cui vengono"
                >
                  Riassunto
                </button>
                {/* Col traduci automatico spento resta il gesto a mano: la
                    traduzione costa una chiamata, e c'è chi preferisce
                    decidere volta per volta se serve. */}
                {daTradurre ? (
                  <button
                    className="bottone secondario mini"
                    onClick={() => traduciArrivati(selezionata.id)}
                    disabled={traducendo}
                    title="Traduci in italiano i messaggi del cliente. L'originale resta a un clic."
                  >
                    {traducendo ? 'Traduco…' : 'Traduci'}
                  </button>
                ) : null}
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
                {/* ── Spam, anche da qui ──
                    Il bottone c'era solo nella riga dell'elenco, dove è
                    un'icona piccola: ma la spazzatura la si riconosce
                    LEGGENDOLA, cioè con la conversazione aperta davanti. Chi
                    l'ha appena letta doveva chiudere, ritrovare la riga e
                    centrare l'icona — e quasi sempre non lo faceva.
                    ⚠️ Solo sulla POSTA: l'elenco dei mittenti ignorati lo
                    leggono soltanto le rotte email, e su WhatsApp o Instagram
                    questo bottone prometterebbe un blocco che non esiste (là si
                    fa da Meta). Un bottone che non fa quello che dice è peggio
                    di un bottone che manca.
                    ⚠️ Non nel cestino: lì la conversazione è già fuori dai
                    piedi, e l'unico gesto che ha senso è ripristinarla o
                    cancellarla. */}
                {selezionata.canale === 'email' && !cestino ? (
                  <button
                    className="bottone secondario mini"
                    onClick={() => segnalaSpam(selezionata.id)}
                    disabled={inCorsoTogli}
                    title={`Segnala come spam: ${selezionata.idEsterno} non arriverà più in posta in arrivo, e questa conversazione va in archivio`}
                  >
                    Spam
                  </button>
                ) : null}
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

              {/* La ✕ di sempre. Un bottone con scritto «Chiudi» occupava lo
                  spazio di due azioni vere in una riga che già non ci stava, e
                  la ✕ in alto a destra la cerca chiunque senza doverla leggere.
                  Il nome resta per chi non vede l'icona: `aria-label`. */}
              {aFinestra ? (
                <button
                  className="chiudi-finestra"
                  onClick={chiudiFinestra}
                  title="Chiudi (Esc)"
                  aria-label="Chiudi"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              ) : null}
            </div>

            {/* Da dove arriva chi ha aperto la chat: chi ha cliccato un annuncio
                non è chi arriva dal passaparola. Solo per il widget dei siti —
                sugli altri canali non lo sappiamo, e non lo si finge. */}
            {selezionata.canale === 'widget' && selezionata.origine ? (
              <div className="provenienza">
                <span className="badge">
                  {NOMI_ORIGINE[selezionata.origine] ?? selezionata.origine}
                </span>
                {selezionata.origineDettaglio ? (
                  <span>{selezionata.origineDettaglio}</span>
                ) : null}
                {selezionata.paginaIngresso ? (
                  <span title="La pagina da cui ha aperto la chat">
                    da {selezionata.paginaIngresso}
                  </span>
                ) : null}
              </div>
            ) : null}

            {/* Il riassunto: data, ora, luogo e prodotto, ognuno con la frase del
                cliente da cui viene. Si apre a richiesta e non chiama l'AI da
                solo: mostra prima quello già salvato. */}
            {riassuntoAperto ? <RiassuntoChat conversazioneId={selezionata.id} /> : null}

            <div className="messaggi" ref={contenitoreRef}>
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
                  placeholder="Cerca la risposta per titolo…"
                  value={cercaRisposta}
                  onChange={(e) => setCercaRisposta(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setRisposteAperte(false)
                      bozzaRef.current?.focus()
                      return
                    }
                    // ⚠️ Invio sceglie la PRIMA della lista: chi arriva qui con
                    // «/» sta scrivendo, e tornare al mouse per il primo
                    // risultato è il motivo per cui poi non si usa più.
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const prima = risposteFiltrate()[0]
                      if (prima) usaRisposta(prima)
                    }
                  }}
                />
                <div className="elenco-risposte">
                  {(() => {
                    const trovate = risposteFiltrate()
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

            {/* ⚠️⚠️ L'AVVISO È IL CUORE DELLA FUNZIONE, non il badge.
                Il badge nell'elenco lo si legge solo se lo si guarda; questo sta
                fra chi scrive e il campo dove scriverà, cioè nell'unico punto in
                cui è impossibile non vederlo. Serve a fermare la risposta doppia
                — due operatori che rispondono insieme e il cliente che riceve
                due versioni diverse dalla stessa azienda.
                ⚠️ Avvisa e basta: il campo resta scrivibile e il bottone attivo.
                Chi ha davanti il cliente al telefono deve poter rispondere subito
                anche se la conversazione risulta di un collega. */}
            {selezionata.presaDaId && selezionata.presaDaId !== ioId ? (
              <div className="avviso-presa">
                <strong>Se ne sta occupando {selezionata.presaDaNome || 'un collega'}.</strong>{' '}
                Puoi rispondere lo stesso — controlla prima che non l’abbia già fatto, così il
                cliente non riceve due risposte diverse.
                <button
                  className="bottone secondario mini"
                  disabled={inCorsoPresa === selezionata.id}
                  onClick={() => prendiInCarico(selezionata.id, 'io')}
                >
                  Passala a me
                </button>
              </div>
            ) : null}

            <div className="composer">
              <textarea
                ref={bozzaRef}
                rows={1}
                placeholder={`Rispondi su ${etichettaCanale(selezionata.canale)}…  ( / per le risposte pronte )`}
                value={bozza}
                onChange={(e) => {
                  const v = e.target.value
                  // ── «/» apre le risposte pronte ──
                  //
                  // Il bottone «Risposte» c'è, ma sta in fondo alla riga e vuole
                  // che la mano lasci la tastiera: chi risponde a venti
                  // messaggi di fila non ci va, e riscrive a mano quello che era
                  // già scritto. La barra è dove la cercano tutti, perché è così
                  // che funziona ovunque.
                  //
                  // ⚠️ SOLO a riquadro VUOTO: dentro un testo la barra è un
                  // carattere come un altro («16/20», «e/o»), e aprire un
                  // pannello mentre si scrive una data sarebbe un dispetto.
                  // ⚠️ La barra non resta scritta: è un comando, non testo — e
                  // se restasse finirebbe nella risposta al cliente.
                  if (v === '/' && !bozza) {
                    setCercaRisposta('')
                    setRisposteAperte(true)
                    return
                  }
                  setBozza(v)
                }}
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
              {/* ⚠️ Tradurre PRIMA di inviare, mai durante: quello che esce da
                  qui lo legge un cliente. La traduzione torna nel riquadro,
                  l'operatore la vede, e solo dopo preme Invia. Mandare la
                  traduzione senza mostrarla vorrebbe dire far leggere a un
                  cliente una frase che in azienda non ha letto nessuno. */}
              {linguaCliente && linguaCliente !== 'italiano' ? (
                <button
                  className="bottone secondario"
                  onClick={() => traduciBozza(linguaCliente)}
                  disabled={traducendo || !bozza.trim()}
                  title={`Traduci quello che hai scritto in ${linguaCliente}. Resta qui: parte solo con Invia.`}
                >
                  {traducendo ? 'Traduco…' : `Traduci in ${linguaCliente}`}
                </button>
              ) : null}
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
