'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { coloreDiPriorita } from '@/lib/format'
import type { QuadroContatto } from '@/lib/sync'
import { CheckAttivita } from './CheckAttivita'
import { BottoneEsegui } from './BottoneEsegui'

type Props = {
  contatto: string
  quadro: QuadroContatto
  onChiudi: () => void
  onRifai: () => void
  inCorso: boolean
}

/**
 * Il pannello a destra con quello che ha capito l'AI su un contatto.
 *
 * Sta sopra la pagina invece di sostituirla: stai guardando la rubrica, e dopo
 * aver letto vuoi tornare dov'eri senza ricaricare tutto.
 */
export function PannelloAI({ contatto, quadro, onChiudi, onRifai, inCorso }: Props) {
  // Esc chiude: è il gesto che chiunque prova per primo su un pannello.
  useEffect(() => {
    const chiudi = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onChiudi()
    }
    window.addEventListener('keydown', chiudi)
    return () => window.removeEventListener('keydown', chiudi)
  }, [onChiudi])

  return (
    <>
      <div className="pannello-velo" onClick={onChiudi} />
      <aside
        className="pannello"
        role="dialog"
        aria-label={`Situazione con ${contatto}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pannello-testa">
          <div style={{ minWidth: 0 }}>
            <div className="nav-label" style={{ padding: 0 }}>
              La situazione secondo l’AI
            </div>
            <div className="pannello-contatto">{contatto}</div>
          </div>
          <button className="pannello-chiudi" onClick={onChiudi} aria-label="Chiudi">
            ✕
          </button>
        </div>

        <div className="pannello-corpo">
          <p className="pannello-situazione">{quadro.situazione}</p>

          {quadro.taskAperti.length > 0 && (
            <>
              <div className="pannello-sezione">Rimasto in sospeso</div>
              <ul className="pannello-lista">
                {quadro.taskAperti.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </>
          )}

          <div className="pannello-sezione">
            {quadro.azioni.length > 0 ? 'Cosa fare · anche in Attività' : 'Cosa fare'}
          </div>
          {quadro.azioni.length === 0 ? (
            <p className="pannello-vuoto">Niente da fare per ora: la palla è dall’altra parte.</p>
          ) : (
            quadro.azioni.map((a) => (
              <div key={a.id} className="pannello-azione">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <CheckAttivita id={a.id} fatta={false} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="pannello-azione-titolo">{a.titolo}</div>
                    {a.dettaglio && <div className="pannello-azione-det">{a.dettaglio}</div>}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span className={`badge ${coloreDiPriorita(a.priorita)}`}>{a.priorita}</span>
                      {a.scadenza && (
                        <span className="muted" style={{ fontSize: 12 }}>
                          entro{' '}
                          {new Date(a.scadenza).toLocaleDateString('it-IT', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      )}
                      <BottoneEsegui id={a.id} />
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="pannello-piede">
          <span className="muted" style={{ fontSize: 12 }}>
            {quadro.messaggiVisti} messaggi letti ·{' '}
            {new Date(quadro.aggiornatoIl).toLocaleDateString('it-IT')}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href={`/rubrica/${encodeURIComponent(contatto)}`} className="btn secondary small">
              Apri contatto
            </Link>
            <button className="btn secondary small" onClick={onRifai} disabled={inCorso}>
              {inCorso ? 'Rileggo…' : 'Rifai il punto'}
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
