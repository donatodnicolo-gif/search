'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { agganciaAlThread, cercaDaAgganciare, type CandidatoAggancio } from '@/lib/actions'
import { dataBreve } from '@/lib/format'

/** Pulsante leggero: lancia l'evento, il modale è uno solo (AgganciaDialog). */
export function AgganciaBottone({ id }: { id: string }) {
  return (
    <button
      type="button"
      className="azione-riga"
      title="Unisci un’altra mail a questa conversazione"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        window.dispatchEvent(new CustomEvent('aimail:aggancia', { detail: { messaggioId: id } }))
      }}
    >
      Aggancia
    </button>
  )
}

/** Il dialogo di aggancio, montato UNA volta per pagina. */
export function AgganciaDialog() {
  const [messaggioId, setMessaggioId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [risultati, setRisultati] = useState<CandidatoAggancio[] | null>(null)
  const [stato, setStato] = useState<string | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  useEffect(() => {
    const su = (e: Event) => {
      setMessaggioId((e as CustomEvent).detail.messaggioId as string)
      setQuery('')
      setRisultati(null)
      setStato(null)
    }
    window.addEventListener('aimail:aggancia', su)
    return () => window.removeEventListener('aimail:aggancia', su)
  }, [])

  if (!messaggioId) return null

  const cerca = () =>
    start(async () => {
      setStato(null)
      setRisultati(await cercaDaAgganciare(messaggioId, query))
    })

  const aggancia = (id: string) =>
    start(async () => {
      const esito = await agganciaAlThread(messaggioId, id)
      setStato(esito.messaggio)
      // Non si chiude né si azzera: si ricarica la stessa ricerca così la mail
      // agganciata diventa «già nel thread» e puoi agganciarne subito altre.
      if (query.trim().length >= 2) {
        setRisultati(await cercaDaAgganciare(messaggioId, query))
      }
      router.refresh()
    })

  return (
    <div className="modal-scrim" onClick={() => setMessaggioId(null)}>
      <div className="modal" role="dialog" aria-label="Aggancia una mail" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Aggancia una mail a questa conversazione</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
          Cerca la mail da unire (per oggetto o mittente): serve quando parlano della stessa cosa
          ma non sono collegate. L’AI le leggerà insieme.
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
                    <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {r.nome && (
                        <span className="badge gold" style={{ flexShrink: 0 }}>
                          <span className="dot" />
                          {r.nome}
                        </span>
                      )}
                      <span>{r.oggetto || '(senza oggetto)'}</span>
                      {r.nel > 1 && (
                        <span className="badge neutral" style={{ flexShrink: 0 }}>{r.nel} messaggi</span>
                      )}
                    </div>
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
          <button className="btn secondary" type="button" onClick={() => setMessaggioId(null)}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
  )
}
