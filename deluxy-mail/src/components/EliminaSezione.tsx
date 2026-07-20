'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { eliminaSezione } from '@/lib/actions'

export function EliminaSezione({ id, nome }: { id: string; nome: string }) {
  const [conferma, setConferma] = useState(false)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  if (!conferma) {
    return (
      <button className="btn danger small" onClick={() => setConferma(true)}>
        Elimina
      </button>
    )
  }

  return (
    <div style={{ display: 'inline-flex', gap: 8 }}>
      <button className="btn secondary small" onClick={() => setConferma(false)} disabled={inCorso}>
        Annulla
      </button>
      <button
        className="btn danger small"
        disabled={inCorso}
        onClick={() =>
          startTransition(async () => {
            await eliminaSezione(id)
            router.refresh()
          })
        }
      >
        Elimino “{nome}”?
      </button>
    </div>
  )
}
