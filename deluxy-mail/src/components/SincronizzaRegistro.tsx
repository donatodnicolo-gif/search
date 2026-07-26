'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sincronizzaCalendarioOra, sincronizzaRegistroOra } from '@/lib/actions'

/**
 * «Sincronizza adesso» col registro Attività condiviso.
 *
 * Normalmente l'allineamento gira da solo (a ogni giro di sincronizzazione
 * della posta, e subito quando spunti un'attività). Questo tasto serve al primo
 * allineamento e a **poter verificare**: un'integrazione che si vede solo cinque
 * minuti dopo è indistinguibile da una che non funziona. L'esito dice quante
 * sono partite, quante sono arrivate e quante non sono riuscite.
 *
 * «Rimanda tutte» ignora le impronte e rispedisce ogni attività: serve dopo aver
 * svuotato il registro, o se si sospetta che i due elenchi siano fuori fase.
 */
export function SincronizzaRegistro({ quale = 'tasks' }: { quale?: 'tasks' | 'calendario' }) {
  const [esito, setEsito] = useState<{ ok: boolean; messaggio: string } | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const lancia = (forza: boolean) =>
    start(async () => {
      setEsito(null)
      const r = quale === 'calendario'
        ? await sincronizzaCalendarioOra(forza)
        : await sincronizzaRegistroOra(forza)
      setEsito(r)
      router.refresh()
    })

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn secondary small" disabled={inCorso} onClick={() => lancia(false)}>
          {inCorso ? 'Sincronizzo…' : 'Sincronizza adesso'}
        </button>
        <button
          type="button"
          className="azione-riga"
          disabled={inCorso}
          title="Rispedisce tutte le attività, anche quelle che risultano già allineate"
          onClick={() => lancia(true)}
        >
          Rimanda tutte
        </button>
      </div>
      {esito && (
        <div
          style={{
            fontSize: 12.5,
            marginTop: 8,
            color: esito.ok ? 'var(--text-secondary)' : 'var(--red)',
          }}
        >
          {esito.messaggio}
        </div>
      )}
    </div>
  )
}
