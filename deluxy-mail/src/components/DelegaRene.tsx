'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { delegaRene } from '@/lib/actions'

/**
 * "Delega Renè": dai un'istruzione a parole e Renè prepara la bozza di risposta
 * a quella mail. Non invia — apre la bozza, la controlli e la mandi tu.
 *
 * `variante`: "riga" è il link discreto nelle azioni della lista; "bottone" è
 * il pulsante nella pagina del messaggio.
 */
export function DelegaRene({ messaggioId, variante = 'riga' }: { messaggioId: string; variante?: 'riga' | 'bottone' }) {
  const [aperto, setAperto] = useState(false)
  const [istruzione, setIstruzione] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const prepara = () =>
    start(async () => {
      setErrore(null)
      const r = await delegaRene(messaggioId, istruzione)
      if (r.ok && r.vaiA) {
        setAperto(false)
        setIstruzione('')
        router.push(r.vaiA)
      } else {
        setErrore(r.messaggio)
      }
    })

  const apri = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setAperto(true)
  }

  return (
    <>
      {variante === 'bottone' ? (
        <button type="button" className="btn secondary small" onClick={apri}>
          <span className="ai-toggle-mark">AI</span> Delega Renè
        </button>
      ) : (
        <button type="button" className="azione-riga" onClick={apri} title="Renè prepara la risposta">
          Delega Renè
        </button>
      )}

      {aperto && (
        <div className="modal-scrim" onClick={() => setAperto(false)}>
          <div className="modal" role="dialog" aria-label="Delega Renè" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              <span className="ai-toggle-mark">AI</span> Delega Renè
            </div>
            <div className="ai-domanda">
              <span className="ai-mark">AI</span>
              <span>Cosa devo rispondere? Dimmi il senso, al resto (saluti, tono, forma) penso io.</span>
            </div>
            <textarea
              value={istruzione}
              onChange={(e) => setIstruzione(e.target.value)}
              placeholder="Es. “Declina con garbo, non è nel nostro target” · “Chiedi il listino e i tempi” · “Accetta e proponi giovedì alle 15”"
              rows={3}
              autoFocus
              style={{ width: '100%', resize: 'vertical', fontSize: 14 }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && istruzione.trim()) prepara()
              }}
            />
            {errore && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 8 }}>{errore}</div>}
            <div className="form-footer" style={{ marginTop: 14 }}>
              <button className="btn secondary" type="button" onClick={() => setAperto(false)} disabled={inCorso}>
                Annulla
              </button>
              <button className="btn primary" type="button" onClick={prepara} disabled={inCorso || !istruzione.trim()}>
                {inCorso ? 'Renè scrive…' : 'Prepara la risposta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
