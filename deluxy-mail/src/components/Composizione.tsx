'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inviaMessaggio } from '@/lib/actions'
import type { Modo } from '@/lib/rispondi'

type Props = {
  messaggioId: string
  modo: Modo
  da: string
  iniziale: { a: string; cc: string; oggetto: string; corpo: string }
  tornaA: string
}

export function Composizione({ messaggioId, modo, da, iniziale, tornaA }: Props) {
  const [a, setA] = useState(iniziale.a)
  const [cc, setCc] = useState(iniziale.cc)
  const [oggetto, setOggetto] = useState(iniziale.oggetto)
  const [corpo, setCorpo] = useState(iniziale.corpo)
  const [stato, setStato] = useState<{ ok: boolean; messaggio: string } | null>(null)
  // L'invio è irreversibile: prima di partire si conferma.
  const [conferma, setConferma] = useState(false)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  function invia() {
    setStato(null)
    startTransition(async () => {
      const form = new FormData()
      form.set('messaggioId', messaggioId)
      form.set('modo', modo)
      form.set('a', a)
      form.set('cc', cc)
      form.set('oggetto', oggetto)
      form.set('corpo', corpo)

      const esito = await inviaMessaggio(form)
      setStato(esito)
      setConferma(false)
      if (esito.ok) {
        router.push(tornaA)
        router.refresh()
      }
    })
  }

  return (
    <div className="card">
      <div className="form-grid">
        <div className="full">
          <label className="field-label">Da</label>
          <input type="text" value={da} disabled />
        </div>

        <div className="full">
          <label className="field-label">
            A <span className="req">*</span>
          </label>
          <input
            type="text"
            value={a}
            onChange={(e) => setA(e.target.value)}
            placeholder={modo === 'inoltra' ? 'A chi lo inoltri?' : ''}
            autoFocus={modo === 'inoltra'}
          />
        </div>

        {(modo === 'tutti' || cc) && (
          <div className="full">
            <label className="field-label">Cc</label>
            <input type="text" value={cc} onChange={(e) => setCc(e.target.value)} />
          </div>
        )}

        <div className="full">
          <label className="field-label">Oggetto</label>
          <input type="text" value={oggetto} onChange={(e) => setOggetto(e.target.value)} />
        </div>

        <div className="full">
          <label className="field-label">Messaggio</label>
          <textarea
            value={corpo}
            onChange={(e) => setCorpo(e.target.value)}
            style={{ minHeight: 300, lineHeight: 1.6 }}
            autoFocus={modo !== 'inoltra'}
          />
        </div>
      </div>

      {stato && (
        <div
          style={{
            fontSize: 13,
            marginTop: 14,
            color: stato.ok ? 'var(--green)' : 'var(--red)',
          }}
        >
          {stato.messaggio}
        </div>
      )}

      <div className="form-footer">
        <button
          className="btn secondary"
          onClick={() => router.push(tornaA)}
          disabled={inCorso}
          type="button"
        >
          Annulla
        </button>

        {conferma ? (
          <>
            <button
              className="btn secondary"
              onClick={() => setConferma(false)}
              disabled={inCorso}
              type="button"
            >
              Torna a modificare
            </button>
            <button className="btn primary" onClick={invia} disabled={inCorso} type="button">
              {inCorso ? 'Invio…' : `Confermi l’invio a ${a || '…'}?`}
            </button>
          </>
        ) : (
          <button
            className="btn primary"
            onClick={() => setConferma(true)}
            disabled={inCorso || !a.trim()}
            type="button"
          >
            Invia
          </button>
        )}
      </div>
    </div>
  )
}
