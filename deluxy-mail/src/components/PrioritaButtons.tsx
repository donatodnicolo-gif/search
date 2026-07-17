'use client'

import { useOptimistic, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { impostaPriorita } from '@/lib/actions'
import { PRIORITA } from '@/lib/format'

type Props = {
  id: string
  priorita: string | null
  prioritaDa: string | null
}

export function PrioritaButtons({ id, priorita, prioritaDa }: Props) {
  // useOptimistic: il pulsante si colora subito, senza aspettare il server.
  // Su una lista di 30 mail l'attesa si sentirebbe a ogni click.
  const [scelta, setScelta] = useOptimistic(priorita)
  const [, startTransition] = useTransition()
  const router = useRouter()

  function scegli(codice: string) {
    // Ripremere il livello già attivo lo toglie: è il modo per tornare
    // indietro senza un pulsante "annulla" in più.
    const nuovo = scelta === codice ? null : codice
    startTransition(async () => {
      setScelta(nuovo)
      await impostaPriorita(id, nuovo)
      router.refresh()
    })
  }

  return (
    <div className="prio-group" onClick={(e) => e.preventDefault()}>
      {PRIORITA.map((p) => {
        const attivo = scelta === p.codice
        return (
          <button
            key={p.codice}
            type="button"
            className={`prio-btn ${p.colore} ${attivo ? 'attivo' : ''}`}
            title={`${p.codice} — ${p.quando}`}
            aria-pressed={attivo}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              scegli(p.codice)
            }}
          >
            {p.etichetta}
          </button>
        )
      })}
      {scelta && (
        <span className="prio-nota">
          {PRIORITA.find((p) => p.codice === scelta)?.quando}
          {prioritaDa === 'ai' && ' · proposta dall’AI'}
        </span>
      )}
    </div>
  )
}
