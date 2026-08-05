'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { decidiSpamCaso } from '@/lib/actions'
import { mostraFlash } from './Flash'

/**
 * «QUESTA SEMBRA FALSA»: la proposta che compare sulla mail quando qualcuno si
 * finge un marchio noto — nome «Shopify», indirizzo su gmail.com.
 *
 * ⚠️ La mail NON è stata spostata: è ancora in posta. Si sposta se dici di sì —
 * e da quel momento la stessa casistica si applica da sola, senza chiedere più.
 * È il compromesso scelto: la prima volta decide una persona, poi decide la
 * regola.
 *
 * ⚠️ Anche il NO conta: si ricorda, e la casistica non viene più proposta.
 */
export function PropostaSpam({ messaggioId, motivo }: { messaggioId: string; motivo: string }) {
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const decidi = (decisione: 'approva' | 'rifiuta') =>
    start(async () => {
      setErrore(null)
      const r = await decidiSpamCaso(messaggioId, decisione)
      if (!r.ok) {
        setErrore(r.messaggio)
        return
      }
      mostraFlash(r.messaggio)
      // Approvata, questa mail è in SPAM: restare qui a guardarla non serve.
      if (decisione === 'approva') router.push('/')
      else router.refresh()
    })

  return (
    <div
      className="ai-box"
      style={{ background: 'rgba(215,0,21,0.06)', borderColor: 'rgba(215,0,21,0.2)', marginBottom: 14 }}
    >
      <div className="ai-box-title" style={{ color: 'var(--red)' }}>
        Attenzione: questa mail sembra falsa
      </div>
      <div className="ai-box-text">
        {motivo}. È il modo classico di fingersi un’azienda: il nome che vedi non è
        l’indirizzo da cui la mail arriva davvero.
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '8px 0 10px' }}>
        Non l’ho spostata: decidi tu. Se dici che è spam, <strong>le prossime uguali</strong>{' '}
        finiranno in SPAM da sole, senza chiedertelo più.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn danger small"
          disabled={inCorso}
          onClick={() => decidi('approva')}
        >
          {inCorso ? 'Sposto…' : 'Sì, è spam — e fallo sempre'}
        </button>
        <button
          type="button"
          className="btn secondary small"
          disabled={inCorso}
          onClick={() => decidi('rifiuta')}
        >
          No, è buona
        </button>
      </div>
      {errore && <div style={{ fontSize: 13, color: 'var(--red)', marginTop: 8 }}>{errore}</div>}
    </div>
  )
}
