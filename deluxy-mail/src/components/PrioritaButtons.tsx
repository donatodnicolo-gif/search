'use client'

import { useEffect, useState, useTransition } from 'react'
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
  // ⚠️ Se il server cambia la priorità (ricarico, un'altra scheda, la regola
  // AI): i bottoni si riallineano. Senza, `useState` teneva il valore del
  // PRIMO render e i P0-P3 mostravano la scelta vecchia — la stessa trappola
  // «stato locale mai riallineato» già pagata su pallino e «letto».
  useEffect(() => setScelta(priorita), [priorita])
  const [stato, setStato] = useState<{ ok: boolean; testo: string } | null>(null)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  function scegli(codice: string) {
    // Ripremere il livello già attivo lo toglie: è il modo per tornare
    // indietro senza un pulsante "annulla" in più.
    const nuovo = scelta === codice ? null : codice
    // Il valore di prima, per rimetterlo se l'azione non arriva mai.
    const prima = scelta
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
        // ⚠️ E si rimette il bottone com'era: lasciarlo acceso accanto a un
        // messaggio rosso mette a schermo due cose che si contraddicono.
        // `router.refresh()` non basterebbe: riallinea l'albero del server ma
        // non rimonta questo componente, e la dipendenza `[priorita]}` non
        // cambia — quindi l'effetto che riallinea non rigira.
        setScelta(prima)
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
