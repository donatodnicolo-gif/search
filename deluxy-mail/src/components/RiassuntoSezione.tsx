'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { riassumiSezioneOra } from '@/lib/actions'

export type RiassuntoSalvato = {
  taglio: string
  giorni: number
  testo: string
  punti: string[]
  messaggiVisti: number
  threadVisti: number
  generatoIl: Date
} | null

/**
 * Il punto della situazione su una sezione, fatto dall'AI. Due tagli: per
 * periodo (ultimi N giorni) o per conversazione.
 */
export function RiassuntoSezione({
  sezioneId,
  iniziale,
}: {
  sezioneId: string
  iniziale: RiassuntoSalvato
}) {
  const [giorni, setGiorni] = useState(7)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const vai = (taglio: 'giorni' | 'thread') =>
    start(async () => {
      setErrore(null)
      const esito = await riassumiSezioneOra(sezioneId, taglio, giorni)
      if (!esito.ok) setErrore(esito.messaggio)
      router.refresh()
    })

  return (
    <div className="sez-riassunto">
      <div className="sez-riassunto-azioni">
        <span className="ai-mark" style={{ color: 'var(--gold-strong)', fontWeight: 600 }}>AI</span>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Fai il punto:</span>

        <button className="btn secondary small" type="button" onClick={() => vai('giorni')} disabled={inCorso}>
          {inCorso ? 'Leggo…' : 'Ultimi'}
        </button>
        <select
          value={giorni}
          onChange={(e) => setGiorni(Number(e.target.value))}
          disabled={inCorso}
          style={{ width: 'auto', padding: '5px 8px', fontSize: 12.5 }}
        >
          {[1, 3, 7, 14, 30].map((g) => (
            <option key={g} value={g}>{g} giorni</option>
          ))}
        </select>

        <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>oppure</span>
        <button className="btn secondary small" type="button" onClick={() => vai('thread')} disabled={inCorso}>
          Per conversazione
        </button>
      </div>

      {errore && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 8 }}>{errore}</div>}

      {iniziale && (
        <div className="ai-box" style={{ marginTop: 12, marginBottom: 0 }}>
          <div className="ai-box-title">
            {iniziale.taglio === 'thread'
              ? `Per conversazione · ${iniziale.threadVisti} conversazioni`
              : `Ultimi ${iniziale.giorni} giorni · ${iniziale.messaggiVisti} messaggi`}
            {' · '}
            {new Date(iniziale.generatoIl).toLocaleString('it-IT', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </div>
          <div className="ai-box-text">{iniziale.testo}</div>
          {iniziale.punti.length > 0 && (
            <ul className="sez-punti">
              {iniziale.punti.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
