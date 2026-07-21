'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { spostaInSezione } from '@/lib/actions'

/** Menu rapido per spostare una mail in una sezione, direttamente dalla riga. */
export function SpostaSezione({
  id,
  sezioneAttuale,
  sezioni,
}: {
  id: string
  sezioneAttuale: string | null
  sezioni: { id: string; nome: string }[]
}) {
  const [inCorso, start] = useTransition()
  const router = useRouter()

  if (sezioni.length === 0) return null

  return (
    <select
      className="sposta-sezione"
      value={sezioneAttuale ?? ''}
      disabled={inCorso}
      title="Sposta in una sezione"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const v = e.target.value || null
        start(async () => {
          await spostaInSezione(id, v)
          router.refresh()
        })
      }}
    >
      <option value="">Sposta in…</option>
      {sezioni.map((s) => (
        <option key={s.id} value={s.id}>
          {s.nome}
        </option>
      ))}
    </select>
  )
}
