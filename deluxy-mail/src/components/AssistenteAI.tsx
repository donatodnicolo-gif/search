'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { avviaAssistenteAI, contaPeriodoAI } from '@/lib/actions'

const PERIODI = [
  { chiave: 'oggi', label: 'Oggi', sotto: 'la posta di oggi' },
  { chiave: 'settimana', label: 'Settimana', sotto: 'ultimi 7 giorni' },
  { chiave: 'mese', label: 'Mese', sotto: 'ultimi 30 giorni' },
] as const

type Conferma = { periodo: string; label: string; totale: number; daLavorare: number }

export function AssistenteAI() {
  const [conferma, setConferma] = useState<Conferma | null>(null)
  const [stato, setStato] = useState<string | null>(null)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  // Prima di spendere: si conta quanti messaggi ci sono e si chiede conferma.
  // Settimana e Mese possono essere centinaia di mail e credito vero.
  function chiedi(periodo: string, label: string) {
    setStato(null)
    startTransition(async () => {
      const c = await contaPeriodoAI(periodo)
      if (c.totale === 0) {
        setStato(`Niente da leggere in questo periodo.`)
        return
      }
      setConferma({ periodo, label, ...c })
    })
  }

  function avvia() {
    if (!conferma) return
    setStato(null)
    startTransition(async () => {
      const esito = await avviaAssistenteAI(conferma.periodo)
      setConferma(null)
      if (esito.ok && esito.rapportoId) {
        router.push(`/assistente/${esito.rapportoId}`)
      } else {
        setStato(esito.messaggio)
      }
    })
  }

  return (
    <div className="assistente">
      <div className="assistente-testa">
        <div>
          <div className="assistente-titolo">Assistente AI</div>
          <div className="assistente-sotto">
            Fai leggere all’AI la posta di un periodo: riassunto, attività e cosa si può
            archiviare.
          </div>
        </div>
      </div>

      {conferma ? (
        <div className="assistente-conferma">
          <span>
            Analizzo <strong>{conferma.daLavorare}</strong>
            {conferma.totale > conferma.daLavorare && ` dei ${conferma.totale}`} messaggi di{' '}
            {conferma.label.toLowerCase()}
            {conferma.totale > conferma.daLavorare && ' (i più recenti)'}. Consuma un po’ di
            credito OpenAI.
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn secondary small" onClick={() => setConferma(null)} disabled={inCorso}>
              Annulla
            </button>
            <button className="btn primary small" onClick={avvia} disabled={inCorso}>
              {inCorso ? 'Leggo la posta…' : 'Procedi'}
            </button>
          </div>
        </div>
      ) : (
        <div className="assistente-bottoni">
          {PERIODI.map((p) => (
            <button
              key={p.chiave}
              className="assistente-btn"
              disabled={inCorso}
              onClick={() => chiedi(p.chiave, p.label)}
            >
              <span className="assistente-btn-label">{p.label}</span>
              <span className="assistente-btn-sotto">{p.sotto}</span>
            </button>
          ))}
        </div>
      )}

      {stato && <div className="assistente-stato">{stato}</div>}
    </div>
  )
}
