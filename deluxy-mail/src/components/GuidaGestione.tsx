'use client'

import { useState, useTransition } from 'react'
import { salvaGuidaGestione } from '@/lib/actions'

/**
 * La guida "Come gestire le richieste": si salva con un riscontro esplicito
 * ("Guida salvata"), invece del vecchio form senza feedback che sembrava non
 * fare nulla.
 */
export function GuidaGestione({ valore, isAdmin }: { valore: string; isAdmin: boolean }) {
  const [testo, setTesto] = useState(valore)
  const [stato, setStato] = useState<string | null>(null)
  const [inCorso, start] = useTransition()

  const salva = () =>
    start(async () => {
      setStato(null)
      const fd = new FormData()
      fd.set('guida', testo)
      await salvaGuidaGestione(fd)
      setStato('Guida salvata.')
    })

  return (
    <>
      <textarea
        rows={6}
        disabled={!isAdmin}
        value={testo}
        onChange={(e) => {
          setTesto(e.target.value)
          setStato(null)
        }}
        maxLength={3000}
        placeholder={'Es.\nOrdini dei siti: priorità P1, sezione «Ordini», crea attività di conferma.\nSolleciti di pagamento: priorità P0.\nRichieste di preventivo: priorità P1, bozza di risposta.'}
        style={{ width: '100%', fontSize: 13.5, lineHeight: 1.6 }}
      />
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
        {isAdmin
          ? 'Vale per tutta la casella e influenza l’analisi (priorità, sezione, attività/bozza).'
          : 'Solo un amministratore può cambiare la guida condivisa.'}
      </div>
      {isAdmin && (
        <div className="form-footer" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end' }}>
          {stato && <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{stato}</span>}
          <button className="btn secondary small" type="button" onClick={salva} disabled={inCorso}>
            {inCorso ? 'Salvo…' : 'Salva guida'}
          </button>
        </div>
      )}
    </>
  )
}
