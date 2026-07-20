'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { avviaRene } from '@/lib/actions'

const PERIODI = [
  { chiave: 'oggi', nome: 'Oggi', sotto: 'la posta di oggi' },
  { chiave: 'settimana', nome: 'Settimana', sotto: 'ultimi 7 giorni' },
  { chiave: 'mese', nome: 'Mese', sotto: 'ultimi 30 giorni' },
]

/** Fa partire un giro di Renè sul periodo scelto. */
export function ReneAvvia() {
  const [stato, setStato] = useState<string | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const vai = (periodo: string) =>
    start(async () => {
      setStato('Leggo la posta del periodo…')
      const esito = await avviaRene(periodo)
      setStato(esito.messaggio)
      if (esito.ok) router.refresh()
    })

  return (
    <div className="assistente" style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 600 }}>Fai un giro di analisi</div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 12px' }}>
        Renè legge posta, SPAM e cestino del periodo, aggiorna il suo taccuino e ti propone
        cosa sistemare. Niente parte senza la tua conferma (salvo le conseguenze che hai
        approvato).
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {PERIODI.map((p) => (
          <button
            key={p.chiave}
            type="button"
            className="assistente-btn"
            onClick={() => vai(p.chiave)}
            disabled={inCorso}
          >
            <span className="assistente-btn-label">{p.nome}</span>
            <span className="assistente-btn-sotto">{p.sotto}</span>
          </button>
        ))}
      </div>
      {stato && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 10 }}>
          {inCorso ? '⏳ ' : ''}
          {stato}
        </div>
      )}
    </div>
  )
}
