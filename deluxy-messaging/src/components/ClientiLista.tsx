'use client'

import { useCallback, useEffect, useState } from 'react'

type ClienteDto = {
  chiave: string
  nome: string
  telefono: string
  email: string
  citta: string
  negozi: string[]
  ordini: number
  speso: number
  ultimoNumero: string
  ultimaData: string
  inRubrica: boolean
}

function dataBreve(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: '2-digit' })
}

export function ClientiLista() {
  const [clienti, setClienti] = useState<ClienteDto[]>([])
  const [totale, setTotale] = useState(0)
  const [googleCollegato, setGoogleCollegato] = useState(false)
  const [caricato, setCaricato] = useState(false)
  const [q, setQ] = useState('')
  const [qCercata, setQCercata] = useState('')
  const [soloDaSalvare, setSoloDaSalvare] = useState(false)
  const [occupato, setOccupato] = useState(false)
  const [avviso, setAvviso] = useState('')
  const [errore, setErrore] = useState('')

  const carica = useCallback(async () => {
    try {
      const p = new URLSearchParams()
      if (qCercata) p.set('q', qCercata)
      if (soloDaSalvare) p.set('rubrica', 'no')
      const res = await fetch('/api/clienti?' + p.toString())
      if (!res.ok) return
      const dati = (await res.json()) as {
        clienti: ClienteDto[]
        totale: number
        googleCollegato: boolean
      }
      setClienti(dati.clienti)
      setTotale(dati.totale)
      setGoogleCollegato(dati.googleCollegato)
    } catch {
      // rete assente
    } finally {
      setCaricato(true)
    }
  }, [qCercata, soloDaSalvare])

  useEffect(() => {
    const t = setTimeout(() => setQCercata(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    carica()
  }, [carica])

  // Porta in rubrica Google tutti i clienti non ancora salvati (stessa
  // operazione della pagina Ordini: un contatto per persona).
  async function salvaTuttiInRubrica() {
    setOccupato(true)
    setAvviso('')
    setErrore('')
    try {
      const res = await fetch('/api/ordini/contatti-tutti', { method: 'POST' })
      const d = (await res.json().catch(() => ({}))) as {
        aggiunti?: number
        aggiornati?: number
        presenti?: number
        errori?: number
        rimasti?: number
        errore?: string
      }
      if (!res.ok) setErrore(d.errore || 'Operazione non riuscita.')
      else
        setAvviso(
          `Rubrica: ${d.aggiunti ?? 0} aggiunti, ${d.aggiornati ?? 0} aggiornati, ${d.presenti ?? 0} già presenti` +
            (d.rimasti ? ` — ne restano ${d.rimasti}, ripremi per continuare.` : '.')
        )
      await carica()
    } catch {
      setErrore('Operazione non riuscita: problema di rete.')
    } finally {
      setOccupato(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, flex: 1 }}>Clienti</h1>
        <button
          className="bottone"
          onClick={salvaTuttiInRubrica}
          disabled={occupato || !googleCollegato}
          title={googleCollegato ? '' : 'Collega Google Contacts nelle Impostazioni'}
        >
          {occupato ? 'Salvo…' : 'Porta tutti in rubrica Google'}
        </button>
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 0 }}>
        La rubrica ricavata dagli ordini: una scheda per persona (stesso telefono = stesso
        cliente), con quanti ordini ha fatto e quando.
      </p>

      <div className="barra-ricerca">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca un cliente: nome, telefono, email, città…"
          aria-label="Cerca clienti"
        />
        <select
          value={soloDaSalvare ? 'no' : ''}
          onChange={(e) => setSoloDaSalvare(e.target.value === 'no')}
          aria-label="Stato rubrica"
        >
          <option value="">Rubrica: tutti</option>
          <option value="no">Non ancora in rubrica</option>
        </select>
      </div>

      {!googleCollegato && caricato ? (
        <div className="avviso-errore">
          Google Contacts non è collegato: vai in Impostazioni → Google Contacts per collegarlo.
        </div>
      ) : null}
      {avviso ? <div className="avviso-ok">{avviso}</div> : null}
      {errore ? <div className="avviso-errore">{errore}</div> : null}

      {caricato ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 12px' }}>
          {totale === 0
            ? 'Nessun cliente trovato.'
            : `${totale.toLocaleString('it-IT')} clienti` +
              (totale > clienti.length ? ` — mostrati i primi ${clienti.length}` : '')}
        </p>
      ) : null}

      {!caricato ? (
        <p style={{ color: 'var(--text-secondary)' }}>Carico…</p>
      ) : clienti.length === 0 ? (
        <div className="card">
          Nessun cliente: scarica prima gli ordini da Shopify nella pagina Ordini.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="tabella">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Telefono</th>
                <th>Email</th>
                <th>Città</th>
                <th>Negozi</th>
                <th style={{ textAlign: 'right' }}>Ordini</th>
                <th style={{ textAlign: 'right' }}>Speso</th>
                <th>Ultimo</th>
                <th>Rubrica</th>
              </tr>
            </thead>
            <tbody>
              {clienti.map((c) => (
                <tr key={c.chiave}>
                  <td>{c.nome || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{c.telefono || '—'}</td>
                  <td>{c.email || '—'}</td>
                  <td>{c.citta || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{c.negozi.join(', ') || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{c.ordini}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {c.speso.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {c.ultimoNumero} · {dataBreve(c.ultimaData)}
                  </td>
                  <td>
                    {c.inRubrica ? (
                      <span className="badge verde">salvato</span>
                    ) : (
                      <span className="badge">da salvare</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
