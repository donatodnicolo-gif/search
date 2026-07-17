'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { eseguiAttivita } from '@/lib/actions'

/**
 * "Esegui" un'attività: l'AI scrive la mail che la porta a termine e ti porta
 * alla bozza, aperta e pronta da controllare. Non invia niente.
 */
export function BottoneEsegui({ id, largo }: { id: string; largo?: boolean }) {
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  function vai(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setErrore(null)
    startTransition(async () => {
      const esito = await eseguiAttivita(id)
      if (esito.ok && esito.vaiA) {
        router.push(esito.vaiA)
      } else {
        setErrore(esito.messaggio)
      }
    })
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <button
        type="button"
        className={`btn primary small ${largo ? '' : ''}`}
        disabled={inCorso}
        onClick={vai}
        title="L’AI scrive la risposta che chiude questa attività"
      >
        {inCorso ? 'Scrivo…' : 'Esegui'}
      </button>
      {errore && <span style={{ fontSize: 12, color: 'var(--red)' }}>{errore}</span>}
    </span>
  )
}
