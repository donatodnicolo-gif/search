'use client'

import { useCallback, useEffect, useState } from 'react'
import { nomeColpa } from '@/lib/reclami'

// I GIUDIZI: per ogni valet e partner, l'insieme dei reclami che gli sono stati
// imputati diventa un punteggio e un'etichetta (Ottimo → Critico). L'operatore
// può aggiungere un giudizio manuale (voto 1-5 + nota) che completa quello
// automatico.

type Fascia = { chiave: string; nome: string; colore: string }
type Riepilogo = {
  totale: number
  aperti: number
  risolti: number
  perGravita: { 1: number; 2: number; 3: number }
}
type Soggetto = {
  tipo: string
  id: string
  nome: string
  punteggio: number
  fascia: Fascia
  riepilogo: Riepilogo
  manuale: { voto: number; nota: string } | null
}

/** "2 gravi · 1 medio": senza separatore finale e con singolare/plurale giusti. */
function riassuntoGravita(r: Riepilogo): string {
  const parti = [
    r.perGravita[3] ? `${r.perGravita[3]} grav${r.perGravita[3] === 1 ? 'e' : 'i'}` : '',
    r.perGravita[2] ? `${r.perGravita[2]} medi${r.perGravita[2] === 1 ? 'o' : ''}` : '',
    r.perGravita[1] ? `${r.perGravita[1]} liev${r.perGravita[1] === 1 ? 'e' : 'i'}` : '',
  ].filter(Boolean)
  return parti.length ? parti.join(' · ') : '—'
}

export function GiudiziLista() {
  const [soggetti, setSoggetti] = useState<Soggetto[]>([])
  const [caricato, setCaricato] = useState(false)
  const [tipo, setTipo] = useState('') // '' | valet | partner
  const [errore, setErrore] = useState('')

  // Editor del giudizio manuale (una riga alla volta).
  const [modifica, setModifica] = useState<{ tipo: string; id: string } | null>(null)
  const [voto, setVoto] = useState(3)
  const [nota, setNota] = useState('')

  const carica = useCallback(async () => {
    try {
      const res = await fetch('/api/reclami/giudizi?' + new URLSearchParams(tipo ? { tipo } : {}))
      if (!res.ok) return
      const d = (await res.json()) as { soggetti: Soggetto[] }
      setSoggetti(d.soggetti)
    } catch {
      // rete assente
    } finally {
      setCaricato(true)
    }
  }, [tipo])

  useEffect(() => {
    carica()
  }, [carica])

  function apriEditor(s: Soggetto) {
    setModifica({ tipo: s.tipo, id: s.id })
    setVoto(s.manuale?.voto ?? 3)
    setNota(s.manuale?.nota ?? '')
    setErrore('')
  }

  async function salvaGiudizio(s: Soggetto) {
    setErrore('')
    try {
      const res = await fetch('/api/reclami/giudizi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          soggettoTipo: s.tipo,
          soggettoId: s.id,
          soggettoNome: s.nome,
          voto,
          nota,
        }),
      })
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { errore?: string }
        setErrore(d.errore || 'Giudizio non salvato.')
        return
      }
      setModifica(null)
      await carica()
    } catch {
      setErrore('Giudizio non salvato: problema di rete.')
    }
  }

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Giudizi</h1>
          <p className="page-sub">
            Valet e partner giudicati sui reclami che gli sono stati imputati. Il giudizio
            automatico pesa gravità e reclami ancora aperti; puoi aggiungere un voto e una nota
            tua.
          </p>
        </div>
      </div>

      {errore ? <div className="avviso-errore">{errore}</div> : null}

      <div className="barra-ricerca">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo soggetto">
          <option value="">Valet e partner</option>
          <option value="valet">Solo valet</option>
          <option value="partner">Solo partner</option>
        </select>
      </div>

      {!caricato ? (
        <div className="vuoto">Carico…</div>
      ) : soggetti.length === 0 ? (
        <div className="vuoto">
          Nessun giudizio ancora: compaiono qui i valet e i partner a cui è stato imputato almeno un
          reclamo.
        </div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Soggetto</th>
                <th>Giudizio</th>
                <th className="num">Reclami</th>
                <th>Gravità</th>
                <th>Voto tuo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {soggetti.map((s) => {
                const inModifica = modifica?.tipo === s.tipo && modifica?.id === s.id
                return (
                  <tr key={`${s.tipo}:${s.id}`}>
                    <td>
                      <div className="cella-nome">{s.nome}</div>
                      <div className="cella-sub">{nomeColpa(s.tipo)}</div>
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{ color: s.fascia.colore, fontWeight: 600 }}
                        title={`Punteggio ${s.punteggio}`}
                      >
                        {s.fascia.nome}
                      </span>
                    </td>
                    <td className="cella-num">
                      {s.riepilogo.totale}
                      {s.riepilogo.aperti ? (
                        <span style={{ color: '#c93400' }}> ({s.riepilogo.aperti} aperti)</span>
                      ) : null}
                    </td>
                    <td className="cella-muta" style={{ whiteSpace: 'nowrap' }}>
                      {riassuntoGravita(s.riepilogo)}
                    </td>
                    <td>
                      {inModifica ? (
                        <select value={voto} onChange={(e) => setVoto(Number(e.target.value))}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>
                              {'★'.repeat(n)}
                            </option>
                          ))}
                        </select>
                      ) : s.manuale ? (
                        <span title={s.manuale.nota}>{'★'.repeat(s.manuale.voto)}</span>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {inModifica ? (
                        <>
                          <input
                            value={nota}
                            onChange={(e) => setNota(e.target.value)}
                            placeholder="Nota (facoltativa)"
                            style={{
                              padding: '5px 10px',
                              border: '1px solid var(--hairline)',
                              borderRadius: 8,
                              marginRight: 6,
                              width: 180,
                            }}
                          />
                          <button className="btn small" onClick={() => salvaGiudizio(s)}>
                            Salva
                          </button>{' '}
                          <button className="btn btn-secondario small" onClick={() => setModifica(null)}>
                            Annulla
                          </button>
                        </>
                      ) : (
                        <button className="btn btn-secondario small" onClick={() => apriEditor(s)}>
                          {s.manuale ? 'Modifica giudizio' : 'Dai un giudizio'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
