'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { svuotaCestino } from '@/lib/actions'

/**
 * Svuotare il cestino è l'unica azione dell'app che cancella davvero qualcosa
 * (la copia locale), quindi chiede conferma dicendo cosa si perde e cosa no.
 */
export function SvuotaCestino({ quanti }: { quanti: number }) {
  const [conferma, setConferma] = useState(false)
  const [stato, setStato] = useState<string | null>(null)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  if (stato) return <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{stato}</span>

  if (!conferma) {
    return (
      <button className="btn danger small" onClick={() => setConferma(true)}>
        Svuota cestino
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 380 }}>
        Rimuovo {quanti} messaggi da AI Mail. Le mail restano sulla casella, ma qui si perdono
        riassunti, attività, bozze e priorità.
      </span>
      <button className="btn secondary small" onClick={() => setConferma(false)} disabled={inCorso}>
        Annulla
      </button>
      <button
        className="btn danger small"
        disabled={inCorso}
        onClick={() =>
          startTransition(async () => {
            const esito = await svuotaCestino()
            setStato(esito.messaggio)
            router.refresh()
          })
        }
      >
        {inCorso ? 'Svuoto…' : 'Confermo'}
      </button>
    </div>
  )
}
