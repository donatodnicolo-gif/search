'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sincronizzaOra } from '@/lib/actions'

export function SyncButton() {
  const [stato, setStato] = useState<string | null>(null)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  function vai() {
    setStato(null)
    startTransition(async () => {
      const esito = await sincronizzaOra()
      setStato(esito.messaggio)
      router.refresh()
    })
  }

  return (
    <div style={{ padding: '0 10px 4px' }}>
      <button className="btn primary" onClick={vai} disabled={inCorso} style={{ width: '100%' }}>
        {inCorso ? 'Leggo la posta…' : 'Aggiorna posta'}
      </button>
      {stato && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.4 }}>
          {stato}
        </div>
      )}
    </div>
  )
}
