'use client'

import { useCallback, useEffect, useState } from 'react'

// Il pop-up per scrivere e MANDARE una mail al cliente da dentro l'app.
//
// Prima il bottone di contatto apriva un link `mailto:`, che dipende dal
// programma di posta del computer: dove non è configurato non succede niente, e
// dove lo è la mail parte da un indirizzo personale, fuori da quest'app e senza
// lasciare traccia. Qui invece parte dalla casella aziendale via SMTP e resta
// registrata in inbox.
//
// Il testo arriva già scritto nella lingua del cliente (src/lib/lingua.ts) e si
// può correggere: non parte niente prima di premere Invia.

type Casella = { id: string; indirizzo: string; nome: string; predefinita: boolean }

export type BozzaMail = {
  a: string
  oggetto: string
  testo: string
  clienteNome?: string
  ordineNumero?: string
}

export function ComponiMail({
  bozza,
  onChiudi,
  onInviata,
}: {
  bozza: BozzaMail
  onChiudi: () => void
  onInviata?: () => void
}) {
  const [a, setA] = useState(bozza.a)
  const [oggetto, setOggetto] = useState(bozza.oggetto)
  const [testo, setTesto] = useState(bozza.testo)
  const [caselle, setCaselle] = useState<Casella[]>([])
  const [casellaId, setCasellaId] = useState('')
  const [inviando, setInviando] = useState(false)
  const [inviata, setInviata] = useState('')
  const [avviso, setAvviso] = useState('')
  const [errore, setErrore] = useState('')

  const caricaCaselle = useCallback(async () => {
    try {
      const res = await fetch('/api/caselle')
      if (!res.ok) return
      const d = (await res.json()) as { caselle: Casella[] }
      setCaselle(d.caselle)
      setCasellaId(d.caselle.find((c) => c.predefinita)?.id ?? d.caselle[0]?.id ?? '')
    } catch {
      // se non si caricano, il server usa la predefinita da solo
    }
  }, [])

  useEffect(() => {
    caricaCaselle()
  }, [caricaCaselle])

  // Esc chiude, ma non mentre sta partendo: chiudere a metà invio lascerebbe il
  // dubbio se la mail è uscita.
  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !inviando) onChiudi()
    }
    document.addEventListener('keydown', tasto)
    return () => document.removeEventListener('keydown', tasto)
  }, [onChiudi, inviando])

  async function invia() {
    setErrore('')
    setAvviso('')
    setInviando(true)
    try {
      const res = await fetch('/api/email/invia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          a,
          oggetto,
          testo,
          casellaId,
          clienteNome: bozza.clienteNome ?? '',
          ordineNumero: bozza.ordineNumero ?? '',
        }),
      })
      const d = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        da?: string
        avviso?: string
        errore?: string
      }
      if (!res.ok || !d.ok) {
        setErrore(d.errore || 'Invio non riuscito.')
        return
      }
      setInviata(d.da ? `Mail inviata da ${d.da}.` : 'Mail inviata.')
      if (d.avviso) setAvviso(d.avviso)
      onInviata?.()
    } catch {
      setErrore('Invio non riuscito: problema di rete.')
    } finally {
      setInviando(false)
    }
  }

  return (
    <div className="velo" onClick={() => !inviando && onChiudi()} role="presentation">
      <div
        className="pannello pannello-mail"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Scrivi una mail al cliente"
      >
        <div className="pannello-testa">
          <div>
            <h2 style={{ margin: 0, fontSize: 19 }}>Scrivi al cliente</h2>
            <div className="cella-sub">
              {bozza.ordineNumero ? `Ordine ${bozza.ordineNumero} · ` : ''}
              parte dalla casella aziendale, non dal tuo programma di posta
            </div>
          </div>
          <button className="btn btn-secondario small" onClick={onChiudi} disabled={inviando}>
            Chiudi
          </button>
        </div>

        {errore ? <div className="avviso-errore">{errore}</div> : null}
        {inviata ? <div className="avviso-ok">{inviata}</div> : null}
        {avviso ? <div className="avviso-errore">{avviso}</div> : null}

        {caselle.length === 0 ? (
          <div className="avviso-errore">
            Nessuna casella di posta configurata: aggiungila in{' '}
            <a href="/caselle" style={{ textDecoration: 'underline' }}>
              Caselle
            </a>
            .
          </div>
        ) : null}

        {caselle.length > 1 ? (
          <label className="campo">
            <span>Da</span>
            <select value={casellaId} onChange={(e) => setCasellaId(e.target.value)}>
              {caselle.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome ? `${c.nome} — ${c.indirizzo}` : c.indirizzo}
                </option>
              ))}
            </select>
          </label>
        ) : caselle.length === 1 ? (
          <div className="campo">
            <span>Da</span>
            <div style={{ padding: '9px 0', fontSize: 14 }}>{caselle[0].indirizzo}</div>
          </div>
        ) : null}

        <label className="campo">
          <span>A</span>
          <input value={a} onChange={(e) => setA(e.target.value)} type="email" />
        </label>
        <label className="campo">
          <span>Oggetto</span>
          <input value={oggetto} onChange={(e) => setOggetto(e.target.value)} />
        </label>
        <label className="campo">
          <span>Messaggio</span>
          <textarea rows={9} value={testo} onChange={(e) => setTesto(e.target.value)} />
        </label>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn"
            onClick={invia}
            disabled={inviando || !a.trim() || !testo.trim() || !!inviata}
          >
            {inviando ? 'Invio…' : inviata ? 'Inviata ✓' : 'Invia'}
          </button>
          <button className="btn btn-secondario" onClick={onChiudi} disabled={inviando}>
            {inviata ? 'Chiudi' : 'Annulla'}
          </button>
          <span className="descrizione" style={{ margin: 0 }}>
            {inviata
              ? 'La trovi in Inbox, nella conversazione del cliente.'
              : 'Rileggi prima di inviare: parte davvero.'}
          </span>
        </div>
      </div>
    </div>
  )
}
