'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { salvaIstruzioniContatto, salvaIstruzioniThread } from '@/lib/actions'

/**
 * Editor delle istruzioni AI mirate, per un contatto o una conversazione.
 * Testo libero, fidato: dice all'AI come comportarsi qui.
 */
export function EditorIstruzioni({
  tipo,
  target,
  valore,
}: {
  tipo: 'contatto' | 'thread'
  target: string // email del contatto oppure id del messaggio
  valore: string
}) {
  const [testo, setTesto] = useState(valore)
  const [stato, setStato] = useState<string | null>(null)
  const [inCorso, start] = useTransition()
  // Di default in sola lettura se ci sono già istruzioni: si modificano col
  // pulsante «Modifica». Se non ce ne sono, si parte già in scrittura.
  const [modifica, setModifica] = useState(valore.trim() === '')
  const router = useRouter()

  const sporco = testo.trim() !== valore.trim()

  const salva = () =>
    start(async () => {
      setStato(null)
      const esito =
        tipo === 'contatto'
          ? await salvaIstruzioniContatto(target, testo)
          : await salvaIstruzioniThread(target, testo)
      setStato(esito.messaggio)
      setModifica(false)
      router.refresh()
    })

  const placeholder =
    tipo === 'contatto'
      ? 'Es. "È il nostro corriere: per lui conta solo la disponibilità mezzi, rispondi breve."'
      : 'Es. "Trattativa sconto in corso: non scendere sotto il 10%, tono cordiale ma fermo."'

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
        <span className="ai-toggle-mark" style={{ background: 'var(--gold-soft)', color: 'var(--gold-strong)' }}>
          AI
        </span>{' '}
        Istruzioni AI {tipo === 'contatto' ? 'per questo contatto' : 'per questa conversazione'}
      </div>
      {!modifica ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {valore.trim() || <span className="muted">Nessuna istruzione.</span>}
          </div>
          <button
            className="btn secondary small"
            type="button"
            onClick={() => {
              setTesto(valore)
              setStato(null)
              setModifica(true)
            }}
          >
            Modifica
          </button>
        </div>
      ) : (
        <>
          <textarea
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            placeholder={placeholder}
            rows={2}
            autoFocus
            style={{ width: '100%', resize: 'vertical', fontSize: 13 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
            <button className="btn secondary small" onClick={salva} disabled={inCorso || !sporco}>
              {inCorso ? 'Salvo…' : 'Salva'}
            </button>
            {valore.trim() !== '' && (
              <button
                className="btn secondary small"
                type="button"
                disabled={inCorso}
                onClick={() => {
                  setTesto(valore)
                  setModifica(false)
                }}
              >
                Annulla
              </button>
            )}
            {stato && <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{stato}</span>}
            {tipo === 'contatto' && !stato && (
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                Salvando, il contatto entra nella AI Inbox.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
