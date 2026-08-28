'use client'

import { useEffect, useState } from 'react'

// Scrivere per primi a un cliente, dall'inbox.
//
// Prima si poteva solo RISPONDERE: per scrivere a chi non aveva mai scritto
// bisognava uscire dall'app. Tre cose in ordine, che è l'ordine in cui si pensa:
// da quale casella parte, a chi, e — se serve — a quale ordine si riferisce.
//
// ⚠️ L'ordine non è un campo decorativo: agganciarlo riempie il destinatario con
// la mail del cliente, mette l'oggetto giusto e fa finire il thread nella colonna
// del marchio di quell'ordine invece che in quella della casella.

type Casella = { id: string; indirizzo: string; nome: string; predefinita: boolean }

type Ordine = {
  numero: string
  clienteNome: string
  email: string
  negozioNome: string
  dataConsegna: string | null
  fasciaConsegna: string
}

export function NuovaMail({ onChiudi, onInviata }: { onChiudi: () => void; onInviata: () => void }) {
  const [caselle, setCaselle] = useState<Casella[]>([])
  const [casellaId, setCasellaId] = useState('')
  const [numeroOrdine, setNumeroOrdine] = useState('')
  const [ordine, setOrdine] = useState<Ordine | null>(null)
  const [cercando, setCercando] = useState(false)
  const [a, setA] = useState('')
  const [oggetto, setOggetto] = useState('')
  const [testo, setTesto] = useState('')
  const [inviando, setInviando] = useState(false)
  const [errore, setErrore] = useState('')

  useEffect(() => {
    fetch('/api/caselle')
      .then((r) => (r.ok ? r.json() : { caselle: [] }))
      .then((d: { caselle?: Casella[] }) => {
        const elenco = d.caselle ?? []
        setCaselle(elenco)
        // La predefinita è quella da cui parte una mail nuova: sceglierla per
        // difetto evita l'errore più caro, scrivere dal brand sbagliato.
        setCasellaId(elenco.find((c) => c.predefinita)?.id ?? elenco[0]?.id ?? '')
      })
      .catch(() => setCaselle([]))
  }, [])

  // Esc chiude, come per il thread.
  useEffect(() => {
    function suTasto(e: KeyboardEvent) {
      if (e.key === 'Escape') onChiudi()
    }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi])

  async function cercaOrdine() {
    const numero = numeroOrdine.replace(/\D/g, '')
    if (!numero || cercando) return
    setCercando(true)
    setErrore('')
    setOrdine(null)
    try {
      const res = await fetch(`/api/ordini/cerca?numero=${numero}`)
      const d = (await res.json().catch(() => ({}))) as { ordine?: Ordine; errore?: string }
      if (!res.ok || !d.ordine) {
        setErrore(d.errore || 'Ordine non trovato.')
        return
      }
      setOrdine(d.ordine)
      // Si riempie quello che è vuoto, senza sovrascrivere ciò che una persona ha
      // già scritto: chi ha corretto il destinatario a mano aveva un motivo.
      if (!a.trim() && d.ordine.email) setA(d.ordine.email)
      if (!oggetto.trim()) setOggetto(`Ordine ${d.ordine.numero}`)
    } catch {
      setErrore('Ricerca non riuscita: problema di rete.')
    } finally {
      setCercando(false)
    }
  }

  async function invia() {
    if (inviando) return
    setInviando(true)
    setErrore('')
    try {
      const res = await fetch('/api/email/nuovo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ casellaId, a, oggetto, testo, ordineNumero: ordine?.numero ?? '' }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Invio non riuscito.')
        return
      }
      onInviata()
    } catch {
      setErrore('Invio non riuscito: problema di rete.')
    } finally {
      setInviando(false)
    }
  }

  const casella = caselle.find((c) => c.id === casellaId)

  return (
    <div className="velo" onClick={onChiudi} role="presentation">
      <div
        className="pannello"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="pannello-testa">
          <h2 style={{ margin: 0, fontSize: 17 }}>Nuovo messaggio</h2>
          {/* ✕ obbligatoria (Libro v1.7 §9): stesso handler di Esc e del velo. */}
          <button className="pannello-chiudi" aria-label="Chiudi" onClick={onChiudi} title="Chiudi (Esc)">
            ✕
          </button>
        </div>

        {caselle.length === 0 ? (
          <p className="descrizione">
            Nessuna casella utilizzabile: serve una casella attiva con la password salvata (pagina
            Caselle).
          </p>
        ) : null}

        <label className="campo">
          <span>Da quale casella</span>
          <select value={casellaId} onChange={(e) => setCasellaId(e.target.value)}>
            {caselle.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome ? `${c.nome} — ${c.indirizzo}` : c.indirizzo}
                {c.predefinita ? ' (predefinita)' : ''}
              </option>
            ))}
          </select>
        </label>

        {/* L'ordine: facoltativo, ma se c'è porta con sé destinatario, oggetto e
            marchio del thread. */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <label className="campo" style={{ flex: 1, marginBottom: 12 }}>
            <span>Numero d&apos;ordine (facoltativo)</span>
            <input
              value={numeroOrdine}
              onChange={(e) => setNumeroOrdine(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  cercaOrdine()
                }
              }}
              placeholder="1742"
              inputMode="numeric"
            />
          </label>
          <button
            className="bottone secondario"
            onClick={cercaOrdine}
            disabled={cercando || !numeroOrdine.trim()}
            style={{ marginBottom: 12 }}
          >
            {cercando ? 'Cerco…' : 'Aggancia'}
          </button>
        </div>

        {ordine ? (
          <div className="avviso-ok" style={{ marginBottom: 12 }}>
            <strong>{ordine.numero}</strong> · {ordine.negozioNome} · {ordine.clienteNome || '—'}
            {ordine.dataConsegna
              ? ` · consegna ${new Date(ordine.dataConsegna).toLocaleDateString('it-IT')}${
                  ordine.fasciaConsegna ? ` ${ordine.fasciaConsegna}` : ''
                }`
              : ''}
            {!ordine.email ? ' · ⚠️ questo ordine non ha una mail: scrivila a mano' : ''}
          </div>
        ) : null}

        <label className="campo">
          <span>A</span>
          <input
            value={a}
            onChange={(e) => setA(e.target.value)}
            placeholder="cliente@esempio.it"
            type="email"
            spellCheck={false}
          />
        </label>
        <label className="campo">
          <span>Oggetto</span>
          <input value={oggetto} onChange={(e) => setOggetto(e.target.value)} />
        </label>
        <label className="campo">
          <span>Messaggio</span>
          <textarea value={testo} onChange={(e) => setTesto(e.target.value)} rows={8} />
        </label>

        {errore ? <div className="avviso-errore">{errore}</div> : null}

        {/* Piede sticky (Libro v1.7 §9): «Invia» resta in vista anche con il
            messaggio lungo scorrato. */}
        <div className="pannello-piede">
          <button
            className="bottone"
            onClick={invia}
            disabled={inviando || !a.trim() || !testo.trim() || !casellaId}
          >
            {inviando ? 'Invio…' : 'Invia'}
          </button>
          <button className="bottone secondario" onClick={onChiudi} disabled={inviando}>
            Annulla
          </button>
          <span className="cella-sub">
            {casella
              ? `Parte da ${casella.indirizzo}, con la firma di questa casella. Resta in Inbox.`
              : ''}
          </span>
        </div>
      </div>
    </div>
  )
}
