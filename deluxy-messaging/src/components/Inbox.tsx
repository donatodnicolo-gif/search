'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  idEsterno: string
  ultimoTesto: string
  ultimoMessaggioIl: string
  nonLetti: number
  /** Il nostro numero che ha ricevuto (solo WhatsApp), in forma leggibile. */
  numeroNostro?: string
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
  const [selezionataId, setSelezionataId] = useState<string | null>(null)
  const [messaggi, setMessaggi] = useState<MessaggioDto[]>([])
  const [bozza, setBozza] = useState('')
  const [inviando, setInviando] = useState(false)
  const [erroreInvio, setErroreInvio] = useState('')
  const fondoRef = useRef<HTMLDivElement>(null)

  const selezionata = conversazioni.find((c) => c.id === selezionataId) ?? null

  const aggiornaConversazioni = useCallback(async () => {
    try {
      const res = await fetch('/api/conversazioni')
      if (!res.ok) return
      const dati = (await res.json()) as { conversazioni: (ConversazioneDto & { ultimoMessaggioIl: string })[] }
      setConversazioni(dati.conversazioni)
    } catch {
      // rete assente: si ritenta al giro dopo
    }
  }, [])

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
    return (
      <button
        key={c.id}
        className={`riga-conversazione${c.id === selezionataId ? ' selezionata' : ''}`}
        onClick={() => {
          setSelezionataId(c.id)
          setErroreInvio('')
        }}
      >
        <span className="testata">
          <span className="nome">{c.nome || c.idEsterno}</span>
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
      </button>
    )
  }

  return (
    <>
    <div className={`inbox${aFinestra ? ' a-colonne' : ''}`}>
      <div className="elenco">
        <div className="barra-elenco">
          <button className="bottone secondario mini" onClick={scaricaPosta} disabled={scaricoPosta === '…'}>
            {scaricoPosta === '…' ? 'Scarico posta…' : 'Scarica posta'}
          </button>
          {scaricoPosta && scaricoPosta !== '…' ? (
            <span className="esito">{scaricoPosta}</span>
          ) : null}
          <button
            className="bottone secondario mini"
            style={{ marginLeft: 'auto' }}
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
            Nessuna conversazione ancora. Quando un cliente scrive su WhatsApp, Messenger,
            Instagram o dal widget del sito, appare qui.
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
              <span className="nome">{selezionata.nome || selezionata.idEsterno}</span>
              {selezionata.brand || selezionata.etichettaAccount || selezionata.numeroNostro ? (
                <span
                  className="badge"
                  title="La nostra linea che ha ricevuto: la risposta parte da qui"
                >
                  {selezionata.brand || selezionata.etichettaAccount || selezionata.numeroNostro}
                </span>
              ) : null}
              <span className={`badge canale-${selezionata.canale}`}>
                {etichettaCanale(selezionata.canale)}
              </span>
              <span className="dettaglio">{selezionata.idEsterno}</span>
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
