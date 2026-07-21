'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { agganciaAlThread, cercaDaAgganciare, type CandidatoAggancio } from '@/lib/actions'
import { dataBreve } from '@/lib/format'

/**
 * "Aggancia" dalla riga della posta: apre un dialogo dove cerchi una mail e la
 * unisci a questa conversazione (da lì in poi l'AI le legge insieme). Riusa le
 * stesse azioni della pagina messaggio, ma senza uscire dalla lista.
 */
export function AgganciaRiga({ messaggioId }: { messaggioId: string }) {
  const [aperto, setAperto] = useState(false)
  const [query, setQuery] = useState('')
  const [risultati, setRisultati] = useState<CandidatoAggancio[] | null>(null)
  const [stato, setStato] = useState<string | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const apri = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setAperto(true)
  }

  const cerca = () =>
    start(async () => {
      setStato(null)
      setRisultati(await cercaDaAgganciare(messaggioId, query))
    })

  const aggancia = (id: string) =>
    start(async () => {
      const esito = await agganciaAlThread(messaggioId, id)
      setStato(esito.messaggio)
      setRisultati(null)
      setQuery('')
      router.refresh()
    })

  return (
    <>
      <button type="button" className="azione-riga" onClick={apri} title="Unisci un’altra mail a questa conversazione">
        Aggancia
      </button>

      {aperto && (
        <div className="modal-scrim" onClick={() => setAperto(false)}>
          <div className="modal" role="dialog" aria-label="Aggancia una mail" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Aggancia una mail a questa conversazione</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
              Cerca la mail da unire (per oggetto o mittente): serve quando parlano della stessa
              cosa ma non sono collegate. L’AI le leggerà insieme.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    cerca()
                  }
                }}
                placeholder="Es. preventivo hotel, oppure marco@"
                autoFocus
                style={{ flex: 1 }}
              />
              <button type="button" className="btn primary small" onClick={cerca} disabled={inCorso || query.trim().length < 2}>
                {inCorso ? 'Cerco…' : 'Cerca'}
              </button>
            </div>

            {stato && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 10 }}>{stato}</div>}

            {risultati && (
              <div style={{ marginTop: 12 }}>
                {risultati.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Nessuna mail trovata.</div>
                ) : (
                  risultati.map((r) => (
                    <div key={r.id} className="aggancio-riga">
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{r.oggetto || '(senza oggetto)'}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                          {r.mittenteNome || r.mittente} · {dataBreve(r.data)}
                        </div>
                      </div>
                      {r.giaNelThread ? (
                        <span className="badge neutral">già nel thread</span>
                      ) : (
                        <button type="button" className="btn secondary small" onClick={() => aggancia(r.id)} disabled={inCorso}>
                          Aggancia
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            <div className="form-footer" style={{ marginTop: 14 }}>
              <button className="btn secondary" type="button" onClick={() => setAperto(false)}>
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
