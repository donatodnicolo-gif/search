'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { approvaTutteRene, cambiaConseguenzaRene } from '@/lib/actions'

/** "Approva tutte" per un'analisi. */
export function ReneApprovaTutte({ analisiId }: { analisiId: string }) {
  const [esito, setEsito] = useState<string | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()
  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <button
        className="btn secondary small"
        type="button"
        disabled={inCorso}
        onClick={() =>
          start(async () => {
            const r = await approvaTutteRene(analisiId)
            setEsito(r.messaggio)
            router.refresh()
          })
        }
      >
        {inCorso ? 'Applico…' : 'Approva tutte'}
      </button>
      {esito && <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{esito}</span>}
    </span>
  )
}

/** L'interruttore di una conseguenza. */
export function ReneConseguenzaSwitch({ id, attiva }: { id: string; attiva: boolean }) {
  const [inCorso, start] = useTransition()
  const router = useRouter()
  return (
    <button
      className="btn secondary small"
      type="button"
      disabled={inCorso}
      onClick={() =>
        start(async () => {
          await cambiaConseguenzaRene(id, !attiva)
          router.refresh()
        })
      }
    >
      {attiva ? 'Sospendi' : 'Riattiva'}
    </button>
  )
}
