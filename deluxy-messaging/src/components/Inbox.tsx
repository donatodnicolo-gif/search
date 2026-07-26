'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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
}

type MessaggioDto = {
  id: string
  direzione: string
  testo: string
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

export function Inbox({ conversazioniIniziali }: { conversazioniIniziali: ConversazioneDto[] }) {
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

  return (
    <div className="inbox">
      <div className="elenco">
        <div className="barra-elenco">
          <button className="bottone secondario mini" onClick={scaricaPosta} disabled={scaricoPosta === '…'}>
            {scaricoPosta === '…' ? 'Scarico posta…' : 'Scarica posta'}
          </button>
          {scaricoPosta && scaricoPosta !== '…' ? (
            <span className="esito">{scaricoPosta}</span>
          ) : null}
        </div>
        {conversazioni.length === 0 ? (
          <div className="vuoto" style={{ padding: 30 }}>
            Nessuna conversazione ancora. Quando un cliente scrive su WhatsApp, Messenger,
            Instagram o dal widget del sito, appare qui.
          </div>
        ) : (
          conversazioni.map((c) => (
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
                <span className="testo">{c.ultimoTesto}</span>
                {c.nonLetti > 0 ? <span className="pill-nonletti">{c.nonLetti}</span> : null}
              </span>
            </button>
          ))
        )}
      </div>

      <div className="thread">
        {!selezionata ? (
          <div className="vuoto">Scegli una conversazione a sinistra.</div>
        ) : (
          <>
            <div className="testata-thread">
              <span className="nome">{selezionata.nome || selezionata.idEsterno}</span>
              <span className={`badge canale-${selezionata.canale}`}>
                {etichettaCanale(selezionata.canale)}
              </span>
              <span className="dettaglio">{selezionata.idEsterno}</span>
            </div>

            <div className="messaggi">
              {messaggi.map((m) => (
                <div key={m.id} className={`bolla ${m.direzione === 'out' ? 'out' : 'in'}`}>
                  {m.testo}
                  <span className={`meta${m.stato === 'errore' ? ' errore' : ''}`}>
                    {oraBreve(m.creatoIl)}
                    {m.direzione === 'out' && m.stato
                      ? ` · ${m.stato === 'errore' ? m.errore || 'errore' : m.stato}`
                      : ''}
                  </span>
                </div>
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
