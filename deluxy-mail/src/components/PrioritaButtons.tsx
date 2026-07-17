'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { impostaPriorita } from '@/lib/actions'
import { PRIORITA } from '@/lib/format'

type Props = {
  id: string
  priorita: string | null
  prioritaDa: string | null
  analizzato: boolean
}

export function PrioritaButtons({ id, priorita, prioritaDa, analizzato }: Props) {
  const [scelta, setScelta] = useState(priorita)
  const [stato, setStato] = useState<{ ok: boolean; testo: string } | null>(null)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  function scegli(codice: string) {
    // Ripremere il livello già attivo lo toglie: è il modo per tornare
    // indietro senza un pulsante "annulla" in più.
    const nuovo = scelta === codice ? null : codice
    setScelta(nuovo)
    setStato(null)

    startTransition(async () => {
      const esito = await impostaPriorita(id, nuovo)
      if (esito.messaggio) setStato({ ok: esito.ok, testo: esito.messaggio })
      router.refresh()
    })
  }

  // L'AI parte solo dando la priorità: senza dirlo, il ritardo del primo click
  // sembrerebbe un impuntamento dell'app.
  const nota = inCorso
    ? 'L’AI sta leggendo il messaggio…'
    : stato
      ? stato.testo
      : scelta
        ? `${PRIORITA.find((p) => p.codice === scelta)?.quando}${
            analizzato ? '' : ' · l’AI non l’ha ancora letto'
          }`
        : null

  return (
    <div className="prio-group" onClick={(e) => e.preventDefault()}>
      {PRIORITA.map((p) => {
        const attivo = scelta === p.codice
        return (
          <button
            key={p.codice}
            type="button"
            className={`prio-btn ${p.colore} ${attivo ? 'attivo' : ''}`}
            title={`${p.codice} — ${p.quando}`}
            aria-pressed={attivo}
            disabled={inCorso}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              scegli(p.codice)
            }}
          >
            {p.etichetta}
          </button>
        )
      })}

      {nota && (
        <span
          className="prio-nota"
          style={stato && !stato.ok ? { color: 'var(--red)' } : undefined}
        >
          {nota}
          {!inCorso && !stato && scelta && prioritaDa === 'ai' && ' · proposta dall’AI'}
        </span>
      )}
    </div>
  )
}
