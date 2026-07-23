'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { salvaNomeThread } from '@/lib/actions'
import { mostraFlash } from './Flash'

const APRI = 'aimail:nome-thread'

/**
 * Pulsante leggero per dare un nome alla conversazione dalla riga della posta.
 * Zero stato: lancia l'evento, il dialogo è UNO solo per pagina (come
 * «Aggancia» e «Delega Renè») — con centinaia di righe montare un modale per
 * riga sarebbe pesantissimo.
 */
export function NomeThreadBottone({ id, nome }: { id: string; nome?: string | null }) {
  return (
    <button
      type="button"
      className="azione-riga"
      title={nome ? `Rinomina «${nome}»` : 'Dai un nome a questa conversazione'}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        window.dispatchEvent(new CustomEvent(APRI, { detail: { messaggioId: id, nome: nome ?? '' } }))
      }}
    >
      {nome ? 'Rinomina' : 'Nome'}
    </button>
  )
}

/** Il dialogo del nome, montato UNA volta per pagina. */
export function NomeThreadDialog() {
  const [messaggioId, setMessaggioId] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  useEffect(() => {
    const su = (e: Event) => {
      const d = (e as CustomEvent).detail as { messaggioId: string; nome: string }
      setMessaggioId(d.messaggioId)
      setNome(d.nome)
      setErrore(null)
    }
    window.addEventListener(APRI, su)
    return () => window.removeEventListener(APRI, su)
  }, [])

  if (!messaggioId) return null
  const chiudi = () => setMessaggioId(null)

  const salva = (testo: string) =>
    start(async () => {
      const esito = await salvaNomeThread(messaggioId, testo)
      if (!esito.ok) {
        setErrore(esito.messaggio)
        return
      }
      mostraFlash(esito.messaggio)
      chiudi()
      router.refresh()
    })

  return (
    <div className="modal-scrim" onClick={chiudi}>
      <div className="modal" role="dialog" aria-label="Nome della conversazione" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Nome della conversazione</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
          Un nome tuo (es. «Trasferte LimoLane»): compare nelle liste al posto dell’oggetto e lo
          puoi cercare nella pagina Thread.
        </p>
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              salva(nome)
            }
          }}
          placeholder="Es. Trasferte LimoLane"
          maxLength={120}
          autoFocus
          style={{ width: '100%' }}
        />
        {errore && <div style={{ fontSize: 13, marginTop: 10, color: 'var(--red)' }}>{errore}</div>}

        <div className="form-footer" style={{ marginTop: 14 }}>
          <button className="btn secondary" type="button" onClick={chiudi} disabled={inCorso}>
            Annulla
          </button>
          {/* Togliere il nome: solo se ce n'è uno da togliere. */}
          <button
            className="btn secondary"
            type="button"
            onClick={() => salva('')}
            disabled={inCorso || !nome.trim()}
          >
            Togli nome
          </button>
          <button className="btn primary" type="button" onClick={() => salva(nome)} disabled={inCorso}>
            {inCorso ? 'Salvo…' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  )
}
