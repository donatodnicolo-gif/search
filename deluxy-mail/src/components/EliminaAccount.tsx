'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { eliminaAccount } from '@/lib/actions'

export function EliminaAccount({ id, email }: { id: string; email: string }) {
  const [conferma, setConferma] = useState(false)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  if (!conferma) {
    return (
      <button className="btn danger small" onClick={() => setConferma(true)}>
        Scollega
      </button>
    )
  }

  return (
    <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        Scollego {email}? I messaggi già scaricati vengono cancellati da AI Mail (la casella
        sul server resta intatta).
      </span>
      <button className="btn secondary small" onClick={() => setConferma(false)} disabled={inCorso}>
        Annulla
      </button>
      <button
        className="btn danger small"
        disabled={inCorso}
        onClick={() =>
          startTransition(async () => {
            await eliminaAccount(id)
            router.refresh()
          })
        }
      >
        Confermo
      </button>
    </div>
  )
}
