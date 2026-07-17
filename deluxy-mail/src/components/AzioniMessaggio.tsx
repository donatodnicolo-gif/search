'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { archiviaMessaggio, segnaLetto, spostaInSezione } from '@/lib/actions'

type Props = {
  id: string
  letto: boolean
  archiviato: boolean
  sezioneId: string | null
  sezioni: { id: string; nome: string }[]
}

export function AzioniMessaggio({ id, letto, archiviato, sezioneId, sezioni }: Props) {
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  function esegui(azione: () => Promise<void>) {
    startTransition(async () => {
      await azione()
      router.refresh()
    })
  }

  return (
    <div className="page-actions">
      <select
        value={sezioneId ?? ''}
        disabled={inCorso}
        onChange={(e) => esegui(() => spostaInSezione(id, e.target.value || null))}
        style={{ width: 'auto', minWidth: 160, padding: '7px 11px', fontSize: 13 }}
      >
        <option value="">Nessuna sezione</option>
        {sezioni.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nome}
          </option>
        ))}
      </select>

      <button
        className="btn secondary small"
        disabled={inCorso}
        onClick={() => esegui(() => segnaLetto(id, !letto))}
      >
        {letto ? 'Segna non letto' : 'Segna letto'}
      </button>

      {!archiviato && (
        <button
          className="btn secondary small"
          disabled={inCorso}
          onClick={() =>
            esegui(async () => {
              await archiviaMessaggio(id)
              router.push('/')
            })
          }
        >
          Archivia
        </button>
      )}
    </div>
  )
}
