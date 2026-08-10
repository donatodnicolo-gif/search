'use client'

import { useState, useTransition } from 'react'
import { corpoDiMessaggio } from '@/lib/actions'
import { dataBreve } from '@/lib/format'

export type RigaPrecedente = {
  id: string
  mittente: string
  mittenteNome: string | null
  direzione: string
  data: Date
  anteprima: string
}

/**
 * LE MAIL PRECEDENTI, mentre scrivi la risposta.
 *
 * ⚠️ Nasce da una richiesta secca: «consentimi di vedere il testo delle mail
 * precedenti anche». Rispondendo si ha continuamente bisogno di ricontrollare
 * cosa è stato detto — un prezzo, una data, chi aveva promesso cosa — e
 * l'unico modo era tornare indietro, cioè abbandonare quello che si stava
 * scrivendo (o aprire una seconda scheda).
 *
 * ⚠️ I testi si chiedono UNO ALLA VOLTA, quando apri quel messaggio: una
 * conversazione lunga sono decine di corpi, e trasportarli tutti per mostrarne
 * uno è la trappola già pagata in posta in arrivo. Una volta letto resta in
 * memoria: riaprirlo non ricarica niente.
 * ⚠️ Nessuna scorciatoia da tastiera qui dentro: si sta scrivendo, ogni tasto
 * è testo.
 */
export function ConversazioneMentreScrivi({ righe }: { righe: RigaPrecedente[] }) {
  const [aperto, setAperto] = useState(false)
  const [testi, setTesti] = useState<Record<string, string>>({})
  const [apertoId, setApertoId] = useState<string | null>(null)
  const [inCorso, start] = useTransition()

  if (righe.length === 0) return null

  const mostra = (id: string) => {
    if (apertoId === id) {
      setApertoId(null)
      return
    }
    setApertoId(id)
    if (testi[id] !== undefined) return
    start(async () => {
      const r = await corpoDiMessaggio(id)
      setTesti((t) => ({ ...t, [id]: r.tradotto || r.testo || '(nessun testo)' }))
    })
  }

  return (
    <div className="card tight" style={{ marginBottom: 14 }}>
      <button
        type="button"
        className="azione-riga"
        style={{ padding: '10px 14px', width: '100%', textAlign: 'left' }}
        onClick={() => setAperto((v) => !v)}
      >
        {aperto ? '▾' : '▸'} Le mail precedenti ({righe.length}) — per ricontrollare mentre scrivi
      </button>

      {aperto && (
        <div style={{ borderTop: '1px solid var(--hairline)' }}>
          {righe.map((r) => (
            <div key={r.id} style={{ borderBottom: '1px solid var(--hairline)' }}>
              <button
                type="button"
                onClick={() => mostra(r.id)}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'baseline',
                  width: '100%',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '10px 14px',
                  font: 'inherit',
                }}
              >
                <strong style={{ fontSize: 13 }}>
                  {r.direzione === 'uscita' ? 'Tu' : r.mittenteNome || r.mittente}
                </strong>
                <span className="muted" style={{ fontSize: 12 }}>
                  {dataBreve(r.data)}
                </span>
                <span
                  className="muted"
                  style={{ fontSize: 12.5, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {r.anteprima}
                </span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {apertoId === r.id ? 'chiudi' : 'leggi'}
                </span>
              </button>

              {apertoId === r.id && (
                <div
                  style={{
                    padding: '0 14px 12px 14px',
                    fontSize: 13,
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    maxHeight: 320,
                    overflowY: 'auto',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {testi[r.id] ?? (inCorso ? 'Leggo…' : '')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
