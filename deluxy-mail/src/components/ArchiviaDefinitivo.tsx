'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { archiviaDefinitivo } from '@/lib/actions'

/**
 * "Archivia definitivo" nella lista: archivia tutta la posta di quel mittente
 * e crea la regola che lo farà anche in futuro.
 *
 * Sta dentro una riga che è un link, quindi ogni click va fermato: senza
 * preventDefault aprirebbe la mail invece di archiviarla. E chiede sempre
 * conferma: crea una regola permanente, non deve partire per sbaglio.
 */
export function ArchiviaDefinitivo({ id, mittente }: { id: string; mittente: string }) {
  const [conferma, setConferma] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  function ferma(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  if (!conferma) {
    return (
      <button
        type="button"
        className="archivia-def"
        disabled={inCorso}
        title={`Archivia questo e tutti i prossimi messaggi da ${mittente}, creando una regola`}
        onClick={(e) => {
          ferma(e)
          setConferma(true)
        }}
      >
        Archivia definitivo
      </button>
    )
  }

  return (
    <span className="archivia-def-conferma" onClick={ferma}>
      <span>
        Sempre da <strong>{mittente}</strong>?
      </span>
      <button
        type="button"
        className="archivia-def"
        disabled={inCorso}
        onClick={(e) => {
          ferma(e)
          setConferma(false)
        }}
      >
        No
      </button>
      <button
        type="button"
        className="archivia-def si"
        disabled={inCorso}
        onClick={(e) => {
          ferma(e)
          startTransition(async () => {
            const esito = await archiviaDefinitivo(id)
            if (!esito.ok) setErrore(esito.messaggio)
            setConferma(false)
            router.refresh()
          })
        }}
      >
        {inCorso ? 'Archivio…' : 'Sì, sempre'}
      </button>
      {errore && <span style={{ color: 'var(--red)' }}>{errore}</span>}
    </span>
  )
}
