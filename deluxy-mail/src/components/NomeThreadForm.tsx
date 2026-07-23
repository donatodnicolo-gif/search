'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { salvaNomeThread } from '@/lib/actions'

/**
 * Il NOME della conversazione. L'oggetto spesso non aiuta a ritrovarla
 * ("Re: IMPORTANTE: 106654/26 …"): con un nome tuo la riconosci a colpo
 * d'occhio nelle liste e la ritrovi cercandola per nome nella pagina Thread.
 */
export function NomeThreadForm({ messaggioId, valore }: { messaggioId: string; valore: string }) {
  const [nome, setNome] = useState(valore)
  const [aperto, setAperto] = useState(false)
  const [stato, setStato] = useState<string | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const salva = (testo: string) =>
    start(async () => {
      const esito = await salvaNomeThread(messaggioId, testo)
      setStato(esito.messaggio)
      setNome(testo.trim())
      setAperto(false)
      router.refresh()
    })

  // Nome già dato e non si sta modificando: si mostra com'è.
  if (nome && !aperto) {
    return (
      <div style={{ marginBottom: 14 }}>
        <div className="aggancio-scelto">
          <span className="badge gold">
            <span className="dot" />
            {nome}
          </span>
          <button type="button" className="azione-riga" onClick={() => setAperto(true)} disabled={inCorso}>
            Rinomina
          </button>
          <button type="button" className="azione-riga" onClick={() => salva('')} disabled={inCorso}>
            Togli nome
          </button>
        </div>
        {stato && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 6 }}>{stato}</div>}
      </div>
    )
  }

  if (!aperto) {
    return (
      <div style={{ marginBottom: 14 }}>
        <button type="button" className="azione-riga" onClick={() => setAperto(true)}>
          ✎ Dai un nome a questa conversazione
        </button>
        {stato && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 6 }}>{stato}</div>}
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <label className="field-label">Nome della conversazione</label>
      <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
        Un nome tuo (es. «Trasferte LimoLane»): compare nelle liste e lo puoi cercare fra i thread.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
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
          style={{ flex: 1 }}
        />
        <button type="button" className="btn primary small" onClick={() => salva(nome)} disabled={inCorso}>
          {inCorso ? 'Salvo…' : 'Salva'}
        </button>
        <button
          type="button"
          className="btn secondary small"
          onClick={() => {
            setNome(valore)
            setAperto(false)
          }}
          disabled={inCorso}
        >
          Annulla
        </button>
      </div>
    </div>
  )
}
