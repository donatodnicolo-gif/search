'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { scaricaStoricoOra } from '@/lib/actions'

type Props = { accountId: string; storicoFinito: boolean; messaggiInArchivio: number }

export function ScaricaStorico({ accountId, storicoFinito, messaggiInArchivio }: Props) {
  const [quanti, setQuanti] = useState(25)
  const [stato, setStato] = useState<string | null>(null)
  const [finito, setFinito] = useState(storicoFinito)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  if (finito) {
    return (
      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        <span className="badge green">
          <span className="dot" />
          Casella completa
        </span>{' '}
        Hai scaricato tutti i {messaggiInArchivio} messaggi: non c’è altra posta vecchia da
        prendere.
      </div>
    )
  }

  function vai() {
    setStato(null)
    startTransition(async () => {
      const esito = await scaricaStoricoOra(accountId, quanti)
      setStato(esito.messaggio)
      if (esito.finito) setFinito(true)
      router.refresh()
    })
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label className="field-label">Quanti alla volta</label>
          <select
            value={quanti}
            onChange={(e) => setQuanti(Number(e.target.value))}
            disabled={inCorso}
            style={{ width: 'auto', minWidth: 120 }}
          >
            <option value={25}>25 messaggi</option>
            <option value={50}>50 messaggi</option>
            <option value={100}>100 messaggi</option>
          </select>
        </div>
        <button className="btn secondary" onClick={vai} disabled={inCorso}>
          {inCorso ? 'Scarico…' : 'Scarica più vecchi'}
        </button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 10, lineHeight: 1.5 }}>
        Ogni blocco va indietro nel tempo partendo dal messaggio più vecchio che hai già.
        Premi più volte per risalire tutta la casella. Ogni messaggio scaricato viene anche
        analizzato dall’AI, quindi consuma credito OpenAI: per questo non parte da solo.
      </div>

      {stato && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 12 }}>{stato}</div>
      )}
    </>
  )
}
