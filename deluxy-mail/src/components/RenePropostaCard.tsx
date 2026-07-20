'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { decidiPropostaRene } from '@/lib/actions'

/** Una proposta di Renè: si approva (anche "per sempre") o si scarta. */
export function RenePropostaCard({ id }: { id: string }) {
  const [esito, setEsito] = useState<string | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const decidi = (approva: boolean, sempre = false) =>
    start(async () => {
      const r = await decidiPropostaRene(id, approva, sempre)
      setEsito(r.messaggio)
      router.refresh()
    })

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button className="btn primary small" type="button" disabled={inCorso} onClick={() => decidi(true)}>
        {inCorso ? '…' : 'Approva'}
      </button>
      <button
        className="btn secondary small"
        type="button"
        disabled={inCorso}
        title="Approva e rendi questo TIPO di azione una conseguenza: d’ora in poi Renè lo farà da solo"
        onClick={() => decidi(true, true)}
      >
        Approva, e fai sempre così
      </button>
      <button className="btn secondary small" type="button" disabled={inCorso} onClick={() => decidi(false)}>
        No
      </button>
      {esito && <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{esito}</span>}
    </div>
  )
}
