'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { pezziDiTesto, ripulisciTestoEmail } from '@/lib/testo-email'

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
  /** Il brand di quel numero, se lo abbiamo collegato in Negozi. */
  brand?: string
}

type MessaggioDto = {
  id: string
  direzione: string
  testo: string
  /** L'oggetto, solo sulle mail: è la prima cosa che si legge. */
  oggetto?: string
  /** Chi ha scritto, solo in uscita. Vuoto sui messaggi vecchi: parte da ora. */
  utenteNome?: string
  stato: string
  errore: string
  creatoIl: string
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

  return (
    <div className={`bolla ${m.direzione === 'out' ? 'out' : 'in'}`}>
      {m.oggetto ? <span className="oggetto">{m.oggetto}</span> : null}
      {pezzi
        ? pezzi.map((p, i) =>
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
        : visibile}
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
          {/* A quale nostro numero ha scritto. Con più WhatsApp
              Business è la prima cosa da sapere: cambia il tono, la
              firma e chi risponde. Dentro le colonne sparisce: la
              colonna dice già il marchio. */}
          {c.brand || c.numeroNostro ? (
            <span
              className="badge badge-marchio"
              title={`Arrivato sul nostro numero ${c.numeroNostro || '—'}`}
            >
              {c.brand || c.numeroNostro}
            </span>
          ) : null}
          <span className="testo">{c.ultimoTesto}</span>
          {c.nonLetti > 0 ? <span className="pill-nonletti">{c.nonLetti}</span> : null}
        </span>
      </button>
    )
  }

  return (
    <div className={`inbox${vista === 'colonne' ? ' a-colonne' : ''}`}>
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

      <div className="thread">
        {!selezionata ? (
          <div className="vuoto">Scegli una conversazione a sinistra.</div>
        ) : (
          <>
            <div className="testata-thread">
              <span className="nome">{selezionata.nome || selezionata.idEsterno}</span>
              {selezionata.brand || selezionata.numeroNostro ? (
                <span
                  className="badge"
                  title="Il nostro numero che ha ricevuto: la risposta parte da qui"
                >
                  {selezionata.brand || selezionata.numeroNostro}
                </span>
              ) : null}
              <span className={`badge canale-${selezionata.canale}`}>
                {etichettaCanale(selezionata.canale)}
              </span>
              <span className="dettaglio">{selezionata.idEsterno}</span>
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

            <div className="composer">
              <textarea
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
      </div>
    </div>
  )
}
