'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

// Il diario di lavoro: le righe che ci si scrive per ricordare cosa c'è da fare
// su un ordine.
//
// ⚠️ Si scrive come sul quaderno di prima — «12562 da fare 16 luglio» — e il
// numero d'ordine viene staccato da solo: chiedere due campi invece di uno
// vorrebbe dire che le righe si continuano a scrivere altrove.

export type NotaDiario = {
  id: string
  ordineNumero: string
  testo: string
  fatta: boolean
  fattaIl: string | null
  autoreNome: string
  fattaDaNome: string
  creatoIl: string
}

function quando(iso: string): string {
  const d = new Date(iso)
  const oggi = new Date()
  const stessoGiorno = d.toDateString() === oggi.toDateString()
  const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  if (stessoGiorno) return ora
  return `${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} · ${ora}`
}

export function Diario() {
  const [note, setNote] = useState<NotaDiario[]>([])
  const [aperte, setAperte] = useState(0)
  const [stato, setStato] = useState<'aperte' | 'fatte' | 'tutte'>('aperte')
  const [q, setQ] = useState('')
  const [testo, setTesto] = useState('')
  const [caricato, setCaricato] = useState(false)
  const [errore, setErrore] = useState('')

  const carica = useCallback(async () => {
    const p = new URLSearchParams({ stato })
    if (q.trim()) p.set('q', q.trim())
    const res = await fetch('/api/diario?' + p.toString())
    if (!res.ok) return
    const d = (await res.json()) as { note: NotaDiario[]; aperte: number }
    setNote(d.note)
    setAperte(d.aperte)
    setCaricato(true)
  }, [stato, q])

  useEffect(() => {
    void carica()
  }, [carica])

  async function aggiungi() {
    const riga = testo.trim()
    if (!riga) return
    setErrore('')
    const res = await fetch('/api/diario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testo: riga }),
    })
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      setErrore(d.errore || 'Riga non salvata.')
      return
    }
    setTesto('')
    await carica()
  }

  async function segna(n: NotaDiario, fatta: boolean) {
    await fetch(`/api/diario/${n.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fatta }),
    })
    await carica()
  }

  async function cancella(n: NotaDiario) {
    if (!window.confirm(`Cancello «${n.testo.slice(0, 60)}»?`)) return
    await fetch(`/api/diario/${n.id}`, { method: 'DELETE' })
    await carica()
  }

  return (
    <>
      <div className="testa-pagina">
        <h1>Diario</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="badge">{aperte} da fare</span>
          <select value={stato} onChange={(e) => setStato(e.target.value as typeof stato)}>
            <option value="aperte">Da fare</option>
            <option value="fatte">Fatte</option>
            <option value="tutte">Tutte</option>
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca nel diario…"
            aria-label="Cerca nel diario"
          />
        </div>
      </div>

      {/* ⚠️ Un campo solo, e si scrive come si è sempre scritto: «12562 da fare
          16 luglio». Il numero d'ordine si stacca da solo — chiedere due campi
          vorrebbe dire che le righe continuano a finire in una chat. */}
      <div className="card">
        <label className="campo">
          <span>Scrivi una riga — comincia col numero d&apos;ordine, se ce l&apos;ha</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={testo}
              onChange={(e) => setTesto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void aggiungi()
                }
              }}
              placeholder="12562 da fare 16 luglio · chiamare il fornitore di Bolzano"
              style={{ flex: 1 }}
            />
            <button className="bottone" onClick={() => void aggiungi()} disabled={!testo.trim()}>
              Aggiungi
            </button>
          </div>
        </label>
        {errore ? <div className="avviso-errore">{errore}</div> : null}
      </div>

      {!caricato ? (
        <p className="descrizione">Carico…</p>
      ) : note.length === 0 ? (
        <p className="colonna-vuota">
          {stato === 'aperte' ? 'Niente da fare: il diario è pulito.' : 'Nessuna riga.'}
        </p>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <ul className="elenco-diario">
            {note.map((n) => (
              <li key={n.id} className={n.fatta ? 'fatta' : ''}>
                <input
                  type="checkbox"
                  checked={n.fatta}
                  onChange={(e) => void segna(n, e.target.checked)}
                  aria-label={n.fatta ? 'Riapri' : 'Segna fatta'}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>
                    {/* Il numero è un link: da una riga del diario si arriva
                        all'ordine, che è quello che si vuole fare dopo averla
                        letta. */}
                    {n.ordineNumero ? (
                      <Link
                        href={`/ordini-globali?q=${encodeURIComponent(n.ordineNumero.replace('#', ''))}`}
                        className="badge"
                        style={{ marginRight: 6 }}
                      >
                        {n.ordineNumero}
                      </Link>
                    ) : null}
                    <span>{n.testo}</span>
                  </div>
                  <div className="cella-sub">
                    {[
                      n.autoreNome ? `scritta da ${n.autoreNome}` : '',
                      quando(n.creatoIl),
                      n.fatta && n.fattaDaNome ? `fatta da ${n.fattaDaNome}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <button className="bottone secondario mini" onClick={() => void cancella(n)}>
                  Cancella
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
