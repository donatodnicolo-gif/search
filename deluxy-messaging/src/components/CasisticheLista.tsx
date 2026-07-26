'use client'

import { useCallback, useEffect, useState } from 'react'
import { COLPA_TIPI, GRAVITA, nomeColpa, nomeGravita, coloreGravita } from '@/lib/reclami'

// Le casistiche di reclamo: il catalogo dei tipi di problema, con la colpa
// tipica e le azioni consigliate da eseguire. Si configura una volta e si riusa
// aprendo i reclami.

type Casistica = {
  id: string
  nome: string
  descrizione: string
  colpaTipica: string
  gravita: number
  azioni: string
  attiva: boolean
}

const VUOTO = { id: '', nome: '', descrizione: '', colpaTipica: 'nessuno', gravita: 2, azioni: '', attiva: true }

export function CasisticheLista() {
  const [casistiche, setCasistiche] = useState<Casistica[]>([])
  const [caricato, setCaricato] = useState(false)
  const [bozza, setBozza] = useState<typeof VUOTO>(VUOTO)
  const [avviso, setAvviso] = useState('')
  const [errore, setErrore] = useState('')
  const [occupato, setOccupato] = useState(false)

  const carica = useCallback(async () => {
    try {
      const res = await fetch('/api/reclami/casistiche')
      if (!res.ok) return
      const d = (await res.json()) as { casistiche: Casistica[] }
      setCasistiche(d.casistiche)
    } catch {
      // rete assente
    } finally {
      setCaricato(true)
    }
  }, [])

  useEffect(() => {
    carica()
  }, [carica])

  async function salva() {
    setErrore('')
    setAvviso('')
    try {
      const res = await fetch('/api/reclami/casistiche', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bozza.id ? bozza : { ...bozza, id: undefined }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Salvataggio non riuscito.')
        return
      }
      setAvviso(bozza.id ? 'Casistica aggiornata.' : 'Casistica aggiunta.')
      setBozza(VUOTO)
      await carica()
    } catch {
      setErrore('Salvataggio non riuscito: problema di rete.')
    }
  }

  async function elimina(id: string) {
    await fetch('/api/reclami/casistiche?id=' + encodeURIComponent(id), { method: 'DELETE' })
    await carica()
  }

  async function caricaEsempi() {
    setOccupato(true)
    setErrore('')
    setAvviso('')
    try {
      const res = await fetch('/api/reclami/casistiche/esempi', { method: 'POST' })
      const d = (await res.json().catch(() => ({}))) as { aggiunte?: number; saltate?: number }
      setAvviso(
        `Casistiche di esempio: ${d.aggiunte ?? 0} aggiunte` +
          (d.saltate ? `, ${d.saltate} già presenti.` : '.')
      )
      await carica()
    } catch {
      setErrore('Operazione non riuscita: problema di rete.')
    } finally {
      setOccupato(false)
    }
  }

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Casistiche</h1>
          <p className="page-sub">
            I tipi di reclamo che gestiamo, ognuno con la colpa tipica, la gravità e le azioni da
            eseguire. Aprendo un reclamo si sceglie una di queste e le sue azioni fanno da checklist
            di partenza.
          </p>
        </div>
        {casistiche.length === 0 && caricato ? (
          <button className="btn" onClick={caricaEsempi} disabled={occupato}>
            {occupato ? 'Aggiungo…' : 'Carica casistiche di esempio'}
          </button>
        ) : null}
      </div>

      {avviso ? <div className="avviso-ok">{avviso}</div> : null}
      {errore ? <div className="avviso-errore">{errore}</div> : null}

      <div className="card" style={{ maxWidth: 720 }}>
        <h2 style={{ marginTop: 0 }}>{bozza.id ? 'Modifica casistica' : 'Nuova casistica'}</h2>
        <label className="campo">
          <span>Nome</span>
          <input
            value={bozza.nome}
            onChange={(e) => setBozza({ ...bozza, nome: e.target.value })}
            placeholder="Consegna in ritardo"
          />
        </label>
        <label className="campo">
          <span>Descrizione</span>
          <input
            value={bozza.descrizione}
            onChange={(e) => setBozza({ ...bozza, descrizione: e.target.value })}
            placeholder="La consegna è arrivata dopo la fascia concordata"
          />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label className="campo">
            <span>Colpa tipica</span>
            <select
              value={bozza.colpaTipica}
              onChange={(e) => setBozza({ ...bozza, colpaTipica: e.target.value })}
            >
              {COLPA_TIPI.map((c) => (
                <option key={c.chiave} value={c.chiave}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Gravità</span>
            <select
              value={bozza.gravita}
              onChange={(e) => setBozza({ ...bozza, gravita: Number(e.target.value) })}
            >
              {GRAVITA.map((g) => (
                <option key={g.livello} value={g.livello}>
                  {g.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="campo">
          <span>Azioni da eseguire (una per riga)</span>
          <textarea
            rows={4}
            value={bozza.azioni}
            onChange={(e) => setBozza({ ...bozza, azioni: e.target.value })}
            placeholder={'Verificare orario reale di consegna\nScusarsi con il cliente\nValutare un omaggio'}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={bozza.attiva}
            onChange={(e) => setBozza({ ...bozza, attiva: e.target.checked })}
          />
          <span>Attiva</span>
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={salva} disabled={!bozza.nome}>
            {bozza.id ? 'Salva modifiche' : 'Aggiungi casistica'}
          </button>
          {bozza.id ? (
            <button className="btn btn-secondario" onClick={() => setBozza(VUOTO)}>
              Annulla
            </button>
          ) : null}
        </div>
      </div>

      {!caricato ? (
        <div className="vuoto" style={{ marginTop: 24 }}>
          Carico…
        </div>
      ) : casistiche.length === 0 ? (
        <div className="vuoto" style={{ marginTop: 24 }}>
          Nessuna casistica ancora. Premi <strong>Carica casistiche di esempio</strong> per partire
          dalle più comuni, poi adattale.
        </div>
      ) : (
        <div className="tabella-wrap" style={{ marginTop: 24 }}>
          <table>
            <thead>
              <tr>
                <th>Casistica</th>
                <th>Colpa tipica</th>
                <th>Gravità</th>
                <th>Azioni</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {casistiche.map((c) => (
                <tr key={c.id} style={c.attiva ? undefined : { opacity: 0.55 }}>
                  <td>
                    <div className="cella-nome">{c.nome}</div>
                    {c.descrizione ? <div className="cella-sub">{c.descrizione}</div> : null}
                  </td>
                  <td className="cella-muta">{nomeColpa(c.colpaTipica)}</td>
                  <td>
                    <span className="badge" style={{ color: coloreGravita(c.gravita) }}>
                      {nomeGravita(c.gravita)}
                    </span>
                  </td>
                  <td className="cella-muta" style={{ maxWidth: 320 }}>
                    {c.azioni
                      ? c.azioni.split('\n').filter(Boolean).length + ' azioni'
                      : '—'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      className="btn btn-secondario small"
                      onClick={() =>
                        setBozza({
                          id: c.id,
                          nome: c.nome,
                          descrizione: c.descrizione,
                          colpaTipica: c.colpaTipica || 'nessuno',
                          gravita: c.gravita,
                          azioni: c.azioni,
                          attiva: c.attiva,
                        })
                      }
                    >
                      Modifica
                    </button>{' '}
                    <button
                      className="btn btn-secondario small"
                      style={{ color: 'var(--red)' }}
                      onClick={() => elimina(c.id)}
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
