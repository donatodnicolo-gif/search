'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { analizzaContatto } from '@/lib/actions'

/**
 * Chiede all'AI il punto della situazione con un contatto.
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
  const [stato, setStato] = useState<{ ok: boolean; testo: string } | null>(null)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  function vai(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setStato(null)
    startTransition(async () => {
      const esito = await analizzaContatto(email)
      setStato({ ok: esito.ok, testo: esito.messaggio })
      router.refresh()
    })
  }

  return (
    <span className="ai-wrap" onClick={(e) => e.preventDefault()}>
      <button
        type="button"
        className={`ai-btn ${aggiornatoIl ? 'fatto' : ''}`}
        disabled={inCorso}
        onClick={vai}
        title={
          aggiornatoIl
            ? `Rifai il punto della situazione (ultimo: ${aggiornatoIl.toLocaleDateString('it-IT')})`
            : 'Fai il punto: l’AI legge le ultime 10 mail e propone cosa fare'
        }
      >
        {inCorso ? 'Leggo…' : 'AI'}
      </button>
      {stato && (
        <span className="ai-esito" style={stato.ok ? undefined : { color: 'var(--red)' }}>
          {stato.testo}
        </span>
      )}
    </span>
  )
}
