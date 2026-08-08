'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { impostaPriorita } from '@/lib/actions'
import { PRIORITA } from '@/lib/format'
import { BottoneRispostaAI } from './BottoneRispostaAI'

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
      try {
        const esito = await impostaPriorita(id, nuovo)
        if (esito.messaggio) setStato({ ok: esito.ok, testo: esito.messaggio })
        router.refresh()
      } catch {
        // Se l'azione stessa fallisce (rete, timeout della funzione), non
        // restare muti: mostra un errore invece di "non succede nulla".
        setStato({ ok: false, testo: 'Non è arrivata risposta: riprova fra poco.' })
      }
    })
  }

  // L'AI legge la mail dando la priorità (riassunto e attività, NON più la
  // bozza di risposta: quella si chiede con R+). Senza dirlo, il ritardo del
  // primo click sembrerebbe un impuntamento dell'app.
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

      {/* R+ : la risposta si CHIEDE, non arriva perché hai dato una priorità.
          Sta qui accanto perché è lo stesso momento — stai decidendo cosa fare
          di questa mail — ma è un gesto diverso e va premuto apposta. */}
      <BottoneRispostaAI id={id} />

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
