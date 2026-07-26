'use client'

import { useCallback, useEffect, useState } from 'react'

// I valet: chi fa materialmente le consegne. Elenco LOCALE e minimo, tenuto solo
// per poter attribuire la colpa di un reclamo a una persona: il registro completo
// dei valet vive nella piattaforma consegne (vedi la nota in prisma/schema.prisma,
// che spiega perché oggi non lo si può rileggere via API).

type Valet = {
  id: string
  nome: string
  telefono: string
  email: string
  zona: string
  note: string
  attivo: boolean
}

const VUOTO = { id: '', nome: '', telefono: '', email: '', zona: '', note: '', attivo: true }

export function ValetLista() {
  const [valet, setValet] = useState<Valet[]>([])
  const [caricato, setCaricato] = useState(false)
  const [q, setQ] = useState('')
  const [bozza, setBozza] = useState<typeof VUOTO>(VUOTO)
  const [avviso, setAvviso] = useState('')
  const [errore, setErrore] = useState('')

  const carica = useCallback(async () => {
    try {
      const res = await fetch('/api/valet?' + new URLSearchParams(q ? { q } : {}))
      if (!res.ok) return
      const d = (await res.json()) as { valet: Valet[] }
      setValet(d.valet)
    } catch {
      // rete assente
    } finally {
      setCaricato(true)
    }
  }, [q])

  useEffect(() => {
    const t = setTimeout(carica, 250)
    return () => clearTimeout(t)
  }, [carica])

  async function salva() {
    setErrore('')
    setAvviso('')
    try {
      const res = await fetch('/api/valet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bozza.id ? bozza : { ...bozza, id: undefined }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Salvataggio non riuscito.')
        return
      }
      setAvviso(bozza.id ? 'Valet aggiornato.' : 'Valet aggiunto.')
      setBozza(VUOTO)
      await carica()
    } catch {
      setErrore('Salvataggio non riuscito: problema di rete.')
    }
  }

  async function elimina(id: string) {
    await fetch('/api/valet?id=' + encodeURIComponent(id), { method: 'DELETE' })
    await carica()
  }

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Valet</h1>
          <p className="page-sub">
            Chi fa materialmente le consegne. Servono per imputare la colpa di un reclamo a una
            persona precisa e per darle un giudizio nella sezione Giudizi. Questo è un elenco
            ridotto, per il servizio clienti: l&apos;anagrafica completa dei valet (compensi, IBAN,
            documenti) resta nella piattaforma consegne.
          </p>
        </div>
      </div>

      {avviso ? <div className="avviso-ok">{avviso}</div> : null}
      {errore ? <div className="avviso-errore">{errore}</div> : null}

      <div className="card" style={{ maxWidth: 640 }}>
        <h2 style={{ marginTop: 0 }}>{bozza.id ? 'Modifica valet' : 'Nuovo valet'}</h2>
        <label className="campo">
          <span>Nome</span>
          <input
            value={bozza.nome}
            onChange={(e) => setBozza({ ...bozza, nome: e.target.value })}
            placeholder="Mario Rossi"
          />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label className="campo">
            <span>Telefono</span>
            <input
              value={bozza.telefono}
              onChange={(e) => setBozza({ ...bozza, telefono: e.target.value })}
              placeholder="+39 333 1234567"
            />
          </label>
          <label className="campo">
            <span>Zona</span>
            <input
              value={bozza.zona}
              onChange={(e) => setBozza({ ...bozza, zona: e.target.value })}
              placeholder="Milano centro"
            />
          </label>
        </div>
        <label className="campo">
          <span>Email</span>
          <input
            value={bozza.email}
            onChange={(e) => setBozza({ ...bozza, email: e.target.value })}
            placeholder="valet@esempio.it"
          />
        </label>
        <label className="campo">
          <span>Note</span>
          <textarea
            rows={2}
            value={bozza.note}
            onChange={(e) => setBozza({ ...bozza, note: e.target.value })}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={bozza.attivo}
            onChange={(e) => setBozza({ ...bozza, attivo: e.target.checked })}
          />
          <span>Attivo</span>
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={salva} disabled={!bozza.nome}>
            {bozza.id ? 'Salva modifiche' : 'Aggiungi valet'}
          </button>
          {bozza.id ? (
            <button className="btn btn-secondario" onClick={() => setBozza(VUOTO)}>
              Annulla
            </button>
          ) : null}
        </div>
      </div>

      <div className="barra-ricerca" style={{ marginTop: 24 }}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca un valet…"
          aria-label="Cerca valet"
        />
      </div>

      {!caricato ? (
        <div className="vuoto">Carico…</div>
      ) : valet.length === 0 ? (
        <div className="vuoto">
          {q ? `Nessun valet per «${q}».` : 'Nessun valet ancora: aggiungi chi fa le consegne.'}
        </div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Telefono</th>
                <th>Zona</th>
                <th>Stato</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {valet.map((v) => (
                <tr key={v.id}>
                  <td>
                    <div className="cella-nome">{v.nome}</div>
                    {v.email ? <div className="cella-sub">{v.email}</div> : null}
                  </td>
                  <td className="cella-muta">{v.telefono || '—'}</td>
                  <td className="cella-muta">{v.zona || '—'}</td>
                  <td>
                    <span className={`badge ${v.attivo ? 'verde' : ''}`}>
                      {v.attivo ? 'Attivo' : 'Sospeso'}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      className="btn btn-secondario small"
                      onClick={() =>
                        setBozza({
                          id: v.id,
                          nome: v.nome,
                          telefono: v.telefono,
                          email: v.email,
                          zona: v.zona,
                          note: v.note,
                          attivo: v.attivo,
                        })
                      }
                    >
                      Modifica
                    </button>{' '}
                    <button
                      className="btn btn-secondario small"
                      style={{ color: 'var(--red)' }}
                      onClick={() => elimina(v.id)}
                    >
                      Elimina
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
