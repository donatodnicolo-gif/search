'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Svuotare il cestino è l'unica azione dell'app che cancella davvero qualcosa
 * (la copia locale e, quando la si ritrova, la mail sul server), quindi chiede
 * conferma dicendo cosa si perde e cosa no.
 *
 * ⚠️ Passa da una FETCH a `/api/svuota-cestino`, non da una Server Action. Le
 * Server Action di Next si accodano con le navigazioni: finché lo svuotamento
 * girava come azione, l'app restava bloccata per tutto il tempo — e il tempo è
 * tanto, perché ogni mail va ritrovata sul server per Message-ID prima di
 * cancellarla. Stessa cura già applicata a «Aggiorna posta».
 */
export function SvuotaCestino({ quanti }: { quanti: number }) {
  const [conferma, setConferma] = useState(false)
  const [stato, setStato] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const router = useRouter()

  const svuota = async () => {
    setInCorso(true)
    try {
      const res = await fetch('/api/svuota-cestino', { method: 'POST' })
      const dati = (await res.json()) as { messaggio?: string }
      setStato(dati.messaggio ?? 'Cestino svuotato.')
      router.refresh()
    } catch {
      setStato('Non riuscito: riprova fra poco.')
    } finally {
      setInCorso(false)
    }
  }

  if (stato) return <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{stato}</span>

  if (!conferma) {
    return (
      <button className="btn danger small" onClick={() => setConferma(true)}>
        Svuota cestino
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 380 }}>
        Rimuovo {quanti} messaggi da AI Mail. Le mail restano sulla casella, ma qui si perdono
        riassunti, attività, bozze e priorità.
      </span>
      <button className="btn secondary small" onClick={() => setConferma(false)} disabled={inCorso}>
        Annulla
      </button>
      <button className="btn danger small" disabled={inCorso} onClick={svuota}>
        {inCorso ? 'Svuoto…' : 'Confermo'}
      </button>
      {inCorso && (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Ogni mail va ritrovata sul server prima di cancellarla: con molte ci vuole un po’.
          <strong> Puoi continuare a usare l’app</strong>, il lavoro va avanti da sé.
        </span>
      )}
    </div>
  )
}
