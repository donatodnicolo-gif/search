'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { agganciaAlThread, cercaDaAgganciare, staccaDalThread, type CandidatoAggancio } from '@/lib/actions'
import { dataBreve } from '@/lib/format'

/**
 * Aggancia altre mail a questa conversazione: da lì in poi l'AI le legge
 * insieme, così ha la situazione completa anche quando la catena di risposte
 * si è rotta o l'oggetto è cambiato.
 */
export function AgganciaMail({
  messaggioId,
  agganciata,
  staccabile = false,
}: {
  messaggioId: string
  agganciata: boolean
  /** La conversazione ha più di una mail: la corrente si può sganciare anche se
   *  il legame è naturale (catena di risposte), non solo se agganciata a mano. */
  staccabile?: boolean
}) {
  const [aperto, setAperto] = useState(false)
  const [query, setQuery] = useState('')
  const [risultati, setRisultati] = useState<CandidatoAggancio[] | null>(null)
  const [stato, setStato] = useState<string | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const cerca = () =>
    start(async () => {
      setStato(null)
      setRisultati(await cercaDaAgganciare(messaggioId, query))
    })

  const aggancia = (id: string) =>
    start(async () => {
      const esito = await agganciaAlThread(messaggioId, id)
      setStato(esito.messaggio)
      // Resta aperto e ricarica la ricerca: puoi agganciare più mail di fila.
      if (query.trim().length >= 2) {
        setRisultati(await cercaDaAgganciare(messaggioId, query))
      }
      router.refresh()
    })

  const stacca = () =>
    start(async () => {
      const esito = await staccaDalThread(messaggioId)
      setStato(esito.messaggio)
      router.refresh()
    })

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn secondary small" onClick={() => setAperto((v) => !v)}>
          {aperto ? 'Chiudi' : '⚭ Aggancia una mail'}
        </button>
        {(agganciata || staccabile) && (
          <button type="button" className="btn secondary small" onClick={stacca} disabled={inCorso}>
            Stacca da questa conversazione
          </button>
        )}
        {stato && <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{stato}</span>}
      </div>

      {aperto && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Cerca la mail da unire a questa conversazione (per oggetto o mittente). Serve quando
            parlano della stessa cosa ma non sono collegate: l’AI le leggerà insieme.
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
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn primary small"
              onClick={cerca}
              disabled={inCorso || query.trim().length < 2}
            >
              {inCorso ? 'Cerco…' : 'Cerca'}
            </button>
          </div>

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
                      <button
                        type="button"
                        className="btn secondary small"
                        onClick={() => aggancia(r.id)}
                        disabled={inCorso}
                      >
                        Aggancia
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
