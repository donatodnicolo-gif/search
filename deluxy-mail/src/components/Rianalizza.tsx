'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { rianalizza } from '@/lib/actions'

/** Rilancia l'analisi quando è andata storta (quota finita, rete giù). */
export function Rianalizza({ id }: { id: string }) {
  const [stato, setStato] = useState<string | null>(null)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <button
        className="btn secondary small"
        disabled={inCorso}
        onClick={() =>
          startTransition(async () => {
            const esito = await rianalizza(id)
            setStato(esito.ok ? null : esito.messaggio)
            router.refresh()
          })
        }
      >
        {inCorso ? 'Riprovo…' : 'Riprova'}
      </button>
      {stato && <span style={{ fontSize: 12, color: 'var(--red)' }}>{stato}</span>}
    </div>
  )
}
