'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { creaAttivitaConProposta, eseguiAttivita, type EsitoNuovaAttivita } from '@/lib/actions'

/**
 * I due tasti in testa alla posta: "Nuova mail" (si scrive da zero) e
 * "Nuova attività". Il secondo apre il dialogo con l'AI: chiede quale attività
 * bisogna seguire, la crea e propone l'azione che può intraprendere.
 */
export function NuoveAzioni() {
  const [aperto, setAperto] = useState(false)
  const [testo, setTesto] = useState('')
  const [esito, setEsito] = useState<EsitoNuovaAttivita | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  function chiudi() {
    setAperto(false)
    setTesto('')
    setEsito(null)
  }

  const chiedi = () =>
    start(async () => {
      setEsito(null)
      const r = await creaAttivitaConProposta(testo)
      setEsito(r)
      if (r.ok) router.refresh()
    })

  const procedi = () =>
    start(async () => {
      if (!esito?.eseguibileId) return
      const r = await eseguiAttivita(esito.eseguibileId)
      if (r.ok && r.vaiA) {
        chiudi()
        router.push(r.vaiA)
      } else {
        setEsito({ ...esito, proposta: undefined, messaggio: r.messaggio, ok: r.ok })
      }
    })

  return (
    <>
      <Link href="/scrivi" className="btn primary small">
        ✎ Nuova mail
      </Link>
      <button type="button" className="btn secondary small" onClick={() => setAperto(true)}>
        + Nuova attività
      </button>

      {aperto && (
        <div className="modal-scrim" onClick={chiudi}>
          <div
            className="modal"
            role="dialog"
            aria-label="Nuova attività"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-title">Nuova attività</div>

            {/* Il dialogo: l'AI chiede quale attività bisogna seguire. */}
            <div className="ai-domanda">
              <span className="ai-mark">AI</span>
              <span>
                Quale attività devo seguire? Raccontamela: cosa c’è da fare, per chi, entro quando.
              </span>
            </div>

            <textarea
              value={testo}
              onChange={(e) => setTesto(e.target.value)}
              placeholder="Es. “Seguire il preventivo per l’hotel: se non risponde entro giovedì, sollecitare”"
              rows={3}
              autoFocus
              style={{ width: '100%', resize: 'vertical', fontSize: 14 }}
            />

            {esito && (
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    fontSize: 13,
                    color: esito.ok ? 'var(--text-secondary)' : 'var(--red)',
                  }}
                >
                  {esito.messaggio}
                </div>

                {/* La proposta di azione che l'AI può intraprendere. */}
                {esito.proposta && (
                  <div className="ai-domanda" style={{ marginTop: 10 }}>
                    <span className="ai-mark">AI</span>
                    <span>{esito.proposta}</span>
                  </div>
                )}
              </div>
            )}

            <div className="form-footer" style={{ marginTop: 14 }}>
              <button className="btn secondary" type="button" onClick={chiudi} disabled={inCorso}>
                {esito?.ok ? 'Va bene così' : 'Annulla'}
              </button>

              {esito?.ok && esito.eseguibileId ? (
                <button className="btn primary" type="button" onClick={procedi} disabled={inCorso}>
                  {inCorso ? 'Preparo…' : 'Procedi: prepara la mail'}
                </button>
              ) : (
                <button
                  className="btn primary"
                  type="button"
                  onClick={chiedi}
                  disabled={inCorso || !testo.trim()}
                >
                  {inCorso ? 'Penso…' : esito?.ok ? 'Chiedi ancora' : 'Chiedi all’AI'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
