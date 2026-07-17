'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { attivaRegola, eliminaRegola } from '@/lib/actions'

export function AzioniRegola({ id, attiva }: { id: string; attiva: boolean }) {
  const [conferma, setConferma] = useState(false)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  function esegui(azione: () => Promise<void>) {
    startTransition(async () => {
      await azione()
      router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <span className={`badge ${attiva ? 'green' : 'neutral'}`}>
        <span className="dot" />
        {attiva ? 'attiva' : 'spenta'}
      </span>
      <button
        className="btn secondary small"
        disabled={inCorso}
        onClick={() => esegui(() => attivaRegola(id, !attiva))}
      >
        {attiva ? 'Spegni' : 'Attiva'}
      </button>
      {conferma ? (
        <>
          <button className="btn secondary small" onClick={() => setConferma(false)} disabled={inCorso}>
            Annulla
          </button>
          <button
            className="btn danger small"
            disabled={inCorso}
            onClick={() => esegui(() => eliminaRegola(id))}
          >
            Confermi?
          </button>
        </>
      ) : (
        <button className="btn danger small" onClick={() => setConferma(true)} disabled={inCorso}>
          Elimina
        </button>
      )}
    </div>
  )
}
