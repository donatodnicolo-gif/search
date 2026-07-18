'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cambiaStatoUtente, eliminaUtente, reimpostaPassword } from '@/lib/auth-actions'

export function AzioniUtente({ id, nome, attivo }: { id: string; nome: string; attivo: boolean }) {
  const [conferma, setConferma] = useState(false)
  const [reset, setReset] = useState(false)
  const [nuova, setNuova] = useState('')
  const [stato, setStato] = useState<string | null>(null)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  function esegui(azione: () => Promise<unknown>) {
    startTransition(async () => {
      await azione()
      router.refresh()
    })
  }

  if (reset) {
    return (
      <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={nuova}
          onChange={(e) => setNuova(e.target.value)}
          placeholder="nuova password"
          style={{ width: 150, padding: '5px 10px', fontSize: 12.5 }}
        />
        <button className="btn secondary small" disabled={inCorso} onClick={() => { setReset(false); setStato(null) }}>
          Annulla
        </button>
        <button
          className="btn primary small"
          disabled={inCorso}
          onClick={() =>
            startTransition(async () => {
              const e = await reimpostaPassword(id, nuova)
              setStato(e.messaggio)
              if (e.ok) { setReset(false); setNuova('') }
            })
          }
        >
          Salva
        </button>
        {stato && <span style={{ fontSize: 12, color: 'var(--red)' }}>{stato}</span>}
      </span>
    )
  }

  if (conferma) {
    return (
      <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Elimino {nome} e tutti i suoi dati?</span>
        <button className="btn secondary small" onClick={() => setConferma(false)} disabled={inCorso}>No</button>
        <button className="btn danger small" disabled={inCorso} onClick={() => esegui(() => eliminaUtente(id))}>Sì</button>
      </span>
    )
  }

  return (
    <span style={{ display: 'inline-flex', gap: 8 }}>
      <button className="btn secondary small" disabled={inCorso} onClick={() => setReset(true)}>
        Password
      </button>
      <button className="btn secondary small" disabled={inCorso} onClick={() => esegui(() => cambiaStatoUtente(id, !attivo))}>
        {attivo ? 'Sospendi' : 'Riattiva'}
      </button>
      <button className="btn danger small" onClick={() => setConferma(true)} disabled={inCorso}>
        Elimina
      </button>
    </span>
  )
}
