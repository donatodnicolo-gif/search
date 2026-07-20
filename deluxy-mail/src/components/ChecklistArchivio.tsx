'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { applicaArchiviazioni } from '@/lib/actions'

type Proposta = { id: string; motivo: string; mittente: string; oggetto: string; data: string }

/**
 * La checklist dei messaggi che l'AI propone di archiviare.
 *
 * Pre-selezionati tutti — l'AI li ha già giudicati archiviabili — ma tu
 * togli la spunta a quelli che vuoi tenere, e solo i selezionati vengono
 * archiviati. Una volta, senza creare regole: se l'AI sbaglia un mittente hai
 * perso un messaggio, non il suo futuro. E resta sul server.
 */
export function ChecklistArchivio({ proposte }: { proposte: Proposta[] }) {
  const [scelti, setScelti] = useState<Set<string>>(new Set(proposte.map((p) => p.id)))
  const [stato, setStato] = useState<string | null>(null)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  function toggle(id: string) {
    setScelti((prec) => {
      const nuovo = new Set(prec)
      if (nuovo.has(id)) nuovo.delete(id)
      else nuovo.add(id)
      return nuovo
    })
  }

  const tutti = scelti.size === proposte.length
  function tuttiONessuno() {
    setScelti(tutti ? new Set() : new Set(proposte.map((p) => p.id)))
  }

  function archivia() {
    setStato(null)
    startTransition(async () => {
      const esito = await applicaArchiviazioni([...scelti])
      setStato(esito.messaggio)
      router.refresh()
    })
  }

  return (
    <div className="card tight">
      <div className="checklist-testa">
        <label className="checkbox-row" style={{ padding: 0 }}>
          <input type="checkbox" checked={tutti} onChange={tuttiONessuno} />
          {tutti ? 'Deseleziona tutti' : 'Seleziona tutti'}
        </label>
        <button className="btn primary small" onClick={archivia} disabled={inCorso || scelti.size === 0}>
          {inCorso ? 'Archivio…' : `Archivia ${scelti.size} selezionati`}
        </button>
      </div>

      {proposte.map((p) => (
        <label key={p.id} className={`checklist-riga ${scelti.has(p.id) ? '' : 'off'}`}>
          <input type="checkbox" checked={scelti.has(p.id)} onChange={() => toggle(p.id)} />
          <span style={{ minWidth: 0, flex: 1 }}>
            <span className="checklist-oggetto">{p.oggetto}</span>
            <span className="checklist-meta">
              {p.mittente} · {p.data} · <span className="muted">{p.motivo}</span>
            </span>
          </span>
        </label>
      ))}

      {stato && (
        <div style={{ padding: '12px 18px', fontSize: 13, color: 'var(--text-secondary)' }}>{stato}</div>
      )}
    </div>
  )
}
