'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  archiviaDefinitivo,
  archiviaMessaggio,
  segnaLetto,
  spostaInSezione,
} from '@/lib/actions'

type Props = {
  id: string
  letto: boolean
  archiviato: boolean
  sezioneId: string | null
  sezioni: { id: string; nome: string }[]
  mittente: string
}

export function AzioniMessaggio({
  id,
  letto,
  archiviato,
  sezioneId,
  sezioni,
  mittente,
}: Props) {
  const [conferma, setConferma] = useState(false)
  const [stato, setStato] = useState<string | null>(null)
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

      {conferma ? (
        <>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 320 }}>
            Archivio tutto quello che arriva da <strong>{mittente}</strong>, anche in futuro?
          </span>
          <button
            className="btn secondary small"
            onClick={() => setConferma(false)}
            disabled={inCorso}
          >
            Annulla
          </button>
          <button
            className="btn danger small"
            disabled={inCorso}
            onClick={() =>
              startTransition(async () => {
                const esito = await archiviaDefinitivo(id)
                setStato(esito.messaggio)
                setConferma(false)
                if (esito.ok) router.push('/')
                else router.refresh()
              })
            }
          >
            {inCorso ? 'Archivio…' : 'Sì, sempre'}
          </button>
        </>
      ) : (
        <button
          className="btn danger small"
          disabled={inCorso}
          onClick={() => setConferma(true)}
          title={`Archivia questo e tutti i prossimi messaggi da ${mittente}`}
        >
          Archivia definitivo
        </button>
      )}

      {stato && (
        <div style={{ fontSize: 12, color: 'var(--red)', width: '100%' }}>{stato}</div>
      )}
    </div>
  )
}
