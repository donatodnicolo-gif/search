'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { generaTokenApi, revocaTokenApi } from '@/lib/actions'

/**
 * Gestione del token con cui le altre app chiamano le API di AI Mail.
 * L'admin lo genera qui; poi lo incolla nelle app chiamanti (header x-api-key).
 */
export function TokenApi({ token, fonte }: { token: string; fonte: 'app' | 'env' | 'nessuno' }) {
  const [mostrato, setMostrato] = useState<string | null>(null)
  const [visibile, setVisibile] = useState(false)
  const [copiato, setCopiato] = useState(false)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  // Il token da mostrare: quello appena generato, o quello già in vigore.
  const valore = mostrato ?? token
  const mascherato = valore ? `${valore.slice(0, 6)}${'•'.repeat(Math.max(0, valore.length - 6))}` : ''

  const genera = () =>
    start(async () => {
      const r = await generaTokenApi()
      if (r.ok && r.token) {
        setMostrato(r.token)
        setVisibile(true)
        setCopiato(false)
      }
      router.refresh()
    })

  const revoca = () =>
    start(async () => {
      if (!window.confirm('Revocare il token? Le app che lo usano smetteranno di funzionare finché non ne generi uno nuovo.')) return
      await revocaTokenApi()
      setMostrato(null)
      router.refresh()
    })

  if (fonte === 'env' && !mostrato) {
    return (
      <p style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>
        Il token è impostato dalla variabile d’ambiente <code className="app-var">API_TOKEN</code> sul
        server: si gestisce da lì. (Genera un token dall’app per prenderne il controllo da qui.)
        <br />
        <button className="btn secondary small" type="button" onClick={genera} disabled={inCorso} style={{ marginTop: 10 }}>
          {inCorso ? 'Genero…' : 'Genera un token gestito dall’app'}
        </button>
      </p>
    )
  }

  if (!valore) {
    return (
      <>
        <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Nessun token attivo: le API di AI Mail rispondono 503. Genera il token e incollalo nelle
          app che devono chiamarci (header <code className="app-var">x-api-key</code>).
        </p>
        <button className="btn primary small" type="button" onClick={genera} disabled={inCorso}>
          {inCorso ? 'Genero…' : 'Genera il token API'}
        </button>
      </>
    )
  }

  return (
    <>
      {mostrato && (
        <div style={{ fontSize: 12.5, color: 'var(--green)', marginBottom: 8 }}>
          Token generato. Copialo ora nelle app chiamanti.
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          readOnly
          value={visibile ? valore : mascherato}
          onFocus={(e) => e.currentTarget.select()}
          style={{ flex: 1, minWidth: 260, fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}
        />
        <button className="btn secondary small" type="button" onClick={() => setVisibile((v) => !v)}>
          {visibile ? 'Nascondi' : 'Mostra'}
        </button>
        <button
          className="btn secondary small"
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(valore)
            setCopiato(true)
          }}
        >
          {copiato ? 'Copiato ✓' : 'Copia'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button className="btn secondary small" type="button" onClick={genera} disabled={inCorso}>
          Rigenera (invalida il vecchio)
        </button>
        <button className="btn secondary small" type="button" onClick={revoca} disabled={inCorso} style={{ color: 'var(--red)' }}>
          Revoca
        </button>
      </div>
    </>
  )
}
