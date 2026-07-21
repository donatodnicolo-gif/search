'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { avviaRene } from '@/lib/actions'

const PERIODI = [
  { chiave: 'oggi', nome: 'Oggi', sotto: 'la posta di oggi' },
  { chiave: 'settimana', nome: 'Settimana', sotto: 'ultimi 7 giorni' },
  { chiave: 'mese', nome: 'Mese', sotto: 'ultimi 30 giorni' },
]

/** Fa partire un giro di Renè sul periodo scelto (ed eventualmente su una sezione). */
export function ReneAvvia({ sezioni = [] }: { sezioni?: { id: string; nome: string }[] }) {
  const [stato, setStato] = useState<string | null>(null)
  // Ambito: '' = tutta la posta, '__null__' = senza sezione, altrimenti l'id.
  const [ambito, setAmbito] = useState('')
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const sezioneId = ambito === '' ? undefined : ambito === '__null__' ? null : ambito

  const vai = (periodo: string) =>
    start(async () => {
      setStato('Leggo la posta del periodo…')
      const esito = await avviaRene(periodo, sezioneId)
      setStato(esito.messaggio)
      if (esito.ok) router.refresh()
    })

  return (
    <div className="assistente" style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 600 }}>Fai un giro di analisi</div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 12px' }}>
        Renè legge posta, SPAM e cestino del periodo, aggiorna il suo taccuino e ti propone
        cosa sistemare. Puoi limitare il giro a una sola sezione col menu qui sotto. Niente
        parte senza la tua conferma (salvo le conseguenze che hai approvato).
      </p>
      <div style={{ marginBottom: 12 }}>
        <select
          value={ambito}
          onChange={(e) => setAmbito(e.target.value)}
          disabled={inCorso}
          title="Su quale posta far girare l’analisi"
          style={{ width: 'auto', minWidth: 180, padding: '9px 12px', fontSize: 13.5 }}
        >
          <option value="">Tutta la posta del periodo</option>
          <option value="__null__">Solo senza sezione (da smistare)</option>
          {sezioni.map((s) => (
            <option key={s.id} value={s.id}>
              Solo la sezione: {s.nome}
            </option>
          ))}
        </select>
      </div>
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
