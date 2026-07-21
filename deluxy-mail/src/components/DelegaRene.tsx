'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { delegaRene, delegaReneEvento } from '@/lib/actions'
import { mostraFlash } from './Flash'

/**
 * Il pulsante "Delega Renè" nella riga o nella pagina messaggio: NON tiene
 * stato né monta un modale (in una lista di 100 righe sarebbero 100 modali).
 * Lancia solo un evento; il modale è uno solo, montato da DelegaReneDialog.
 */
export function DelegaReneBottone({ id, variante = 'riga' }: { id: string; variante?: 'riga' | 'bottone' }) {
  const apri = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    window.dispatchEvent(new CustomEvent('aimail:delega', { detail: { messaggioId: id } }))
  }
  return variante === 'bottone' ? (
    <button type="button" className="btn secondary small" onClick={apri}>
      <span className="ai-toggle-mark">AI</span> Delega Renè
    </button>
  ) : (
    <button type="button" className="azione-riga" onClick={apri} title="Renè prepara la risposta">
      Delega Renè
    </button>
  )
}

/**
 * Il dialogo di "Delega Renè", montato UNA volta per pagina. Si apre quando una
 * riga (o un bottone) lancia l'evento aimail:delega. Dai un'istruzione a parole
 * e Renè prepara la bozza di risposta a quella mail.
 */
export function DelegaReneDialog() {
  const [messaggioId, setMessaggioId] = useState<string | null>(null)
  const [istruzione, setIstruzione] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  useEffect(() => {
    const su = (e: Event) => {
      setMessaggioId((e as CustomEvent).detail.messaggioId as string)
      setIstruzione('')
      setErrore(null)
    }
    window.addEventListener('aimail:delega', su)
    return () => window.removeEventListener('aimail:delega', su)
  }, [])

  if (!messaggioId) return null

  const prepara = () =>
    start(async () => {
      setErrore(null)
      const r = await delegaRene(messaggioId, istruzione)
      if (r.ok && r.vaiA) {
        setMessaggioId(null)
        router.push(r.vaiA)
      } else {
        setErrore(r.messaggio)
      }
    })

  const inAgenda = () =>
    start(async () => {
      setErrore(null)
      const r = await delegaReneEvento(messaggioId, istruzione)
      if (r.ok) {
        setMessaggioId(null)
        mostraFlash(r.messaggio)
        router.refresh()
      } else {
        setErrore(r.messaggio)
      }
    })

  return (
    <div className="modal-scrim" onClick={() => setMessaggioId(null)}>
      <div className="modal" role="dialog" aria-label="Delega Renè" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          <span className="ai-toggle-mark">AI</span> Delega Renè
        </div>
        <div className="ai-domanda">
          <span className="ai-mark">AI</span>
          <span>
            Dimmi cosa fare: <strong>rispondere</strong> (dammi il senso, a saluti e tono penso io)
            oppure <strong>mettere in agenda</strong> l’appuntamento di questa mail.
          </span>
        </div>
        <textarea
          value={istruzione}
          onChange={(e) => setIstruzione(e.target.value)}
          placeholder="Rispondi: “Declina con garbo” · “Chiedi il listino”.  In agenda: “La call è giovedì alle 15” · lascia vuoto e prendo data e ora dalla mail."
          rows={3}
          autoFocus
          style={{ width: '100%', resize: 'vertical', fontSize: 14 }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && istruzione.trim()) prepara()
          }}
        />
        {errore && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 8 }}>{errore}</div>}
        <div className="form-footer" style={{ marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn secondary" type="button" onClick={() => setMessaggioId(null)} disabled={inCorso}>
            Annulla
          </button>
          <button className="btn secondary" type="button" onClick={inAgenda} disabled={inCorso}>
            {inCorso ? '…' : '＋ Metti in agenda'}
          </button>
          <button className="btn primary" type="button" onClick={prepara} disabled={inCorso || !istruzione.trim()}>
            {inCorso ? 'Renè scrive…' : 'Prepara la risposta'}
          </button>
        </div>
      </div>
    </div>
  )
}
