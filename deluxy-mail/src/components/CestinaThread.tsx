'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cestinaThread } from '@/lib/actions'
import { mettiFlash } from './Flash'

/**
 * Cestina TUTTE le mail della conversazione, dalla pagina della conversazione
 * stessa. Prima chiede conferma: tocca più mail insieme, e dev'essere chiaro
 * quante. Dal cestino si recuperano (non è una cancellazione dal server).
 */
export function CestinaThread({ messaggioId, quante }: { messaggioId: string; quante: number }) {
  const [conferma, setConferma] = useState(false)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const cestina = () =>
    start(async () => {
      const esito = await cestinaThread(messaggioId)
      mettiFlash(esito.messaggio)
      router.push('/')
      router.refresh()
    })

  if (!conferma) {
    return (
      <button
        type="button"
        className="btn secondary small"
        onClick={() => setConferma(true)}
        title="Sposta nel cestino tutte le mail di questa conversazione"
      >
        Cestina tutta la conversazione
      </button>
    )
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13 }}>
        Sposto nel cestino {quante} {quante === 1 ? 'mail' : 'mail'}: si recuperano dal Cestino.
      </span>
      <button className="btn secondary small" type="button" onClick={() => setConferma(false)} disabled={inCorso}>
        Annulla
      </button>
      <button className="btn danger small" type="button" onClick={cestina} disabled={inCorso}>
        {inCorso ? 'Cestino…' : 'Sì, cestina tutto'}
      </button>
    </span>
  )
}
