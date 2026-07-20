'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { analizzaContatto } from '@/lib/actions'
import type { QuadroContatto } from '@/lib/sync'
import { PannelloAI } from './PannelloAI'

/**
 * Chiede all'AI il punto della situazione con un contatto e lo mostra nel
 * pannello a destra.
 *
 * Sta dentro schede e righe che sono link: ogni click va fermato, o invece di
 * analizzare aprirebbe la scheda del contatto.
 */
export function BottoneAI({
  email,
  aggiornatoIl,
}: {
  email: string
  aggiornatoIl?: Date | null
}) {
  const [quadro, setQuadro] = useState<QuadroContatto | null>(null)
  const [aperto, setAperto] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  function carica(rifai: boolean, e?: React.MouseEvent) {
    e?.preventDefault()
    e?.stopPropagation()
    setErrore(null)
    setAperto(true)
    startTransition(async () => {
      const esito = await analizzaContatto(email, rifai)
      if (esito.ok && esito.quadro) {
        setQuadro(esito.quadro)
      } else {
        setErrore(esito.messaggio)
      }
      router.refresh()
    })
  }

  return (
    <>
      <span className="ai-wrap" onClick={(e) => e.preventDefault()}>
        <button
          type="button"
          className={`ai-btn ${aggiornatoIl ? 'fatto' : ''}`}
          disabled={inCorso}
          onClick={(e) => carica(false, e)}
          title={
            aggiornatoIl
              ? `Rivedi la situazione (ultimo: ${new Date(aggiornatoIl).toLocaleDateString('it-IT')})`
              : 'Fai il punto: l’AI legge le ultime 10 mail e propone cosa fare'
          }
        >
          {inCorso && !aperto ? 'Leggo…' : 'AI'}
        </button>
      </span>

      {aperto && (
        <>
          {quadro ? (
            <PannelloAI
              contatto={email}
              quadro={quadro}
              onChiudi={() => setAperto(false)}
              onRifai={() => carica(true)}
              inCorso={inCorso}
            />
          ) : (
            <>
              <div className="pannello-velo" onClick={() => setAperto(false)} />
              <aside className="pannello" role="dialog">
                <div className="pannello-testa">
                  <div className="nav-label" style={{ padding: 0 }}>
                    La situazione secondo l’AI
                  </div>
                  <button
                    className="pannello-chiudi"
                    onClick={() => setAperto(false)}
                    aria-label="Chiudi"
                  >
                    ✕
                  </button>
                </div>
                <div className="pannello-corpo">
                  {errore ? (
                    <p style={{ color: 'var(--red)', fontSize: 14 }}>{errore}</p>
                  ) : (
                    <p className="pannello-vuoto">
                      L’AI sta leggendo le ultime mail scambiate con {email}…
                    </p>
                  )}
                </div>
              </aside>
            </>
          )}
        </>
      )}
    </>
  )
}
