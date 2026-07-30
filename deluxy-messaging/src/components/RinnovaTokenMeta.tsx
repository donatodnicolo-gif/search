'use client'

import { useState } from 'react'

// «Rinnova i token adesso».
//
// ⚠️ Serve perché il token dell'«Instagram API con login di Instagram» dura 60
// giorni e non si rinnova da sé: il cron notturno lo fa in anticipo, ma la prima
// volta si vuole sapere subito se quel token si rinnova o se viene da un utente
// di sistema — in quel caso non scade, l'endpoint risponde errore, e va letto
// come una buona notizia invece che come un guasto.
export function RinnovaTokenMeta() {
  const [inCorso, setInCorso] = useState(false)
  const [righe, setRighe] = useState<{ account: string; esito: string }[] | null>(null)
  const [errore, setErrore] = useState('')

  async function rinnova() {
    setInCorso(true)
    setErrore('')
    setRighe(null)
    try {
      const res = await fetch('/api/account-meta/rinnova', { method: 'POST' })
      const d = (await res.json().catch(() => ({}))) as {
        dettagli?: { account: string; esito: string }[]
        provati?: number
        errore?: string
      }
      if (!res.ok) {
        setErrore(d.errore || 'Rinnovo non riuscito.')
        return
      }
      setRighe(d.dettagli ?? [])
    } catch {
      setErrore('Rinnovo non riuscito: problema di rete.')
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div style={{ marginTop: 4 }}>
      <button type="button" className="bottone secondario" onClick={rinnova} disabled={inCorso}>
        {inCorso ? 'Rinnovo…' : 'Rinnova i token adesso'}
      </button>
      {errore ? (
        <div className="avviso-errore" style={{ marginTop: 10 }}>
          {errore}
        </div>
      ) : null}
      {righe ? (
        righe.length === 0 ? (
          <p className="cella-sub" style={{ marginTop: 10, marginBottom: 0 }}>
            Nessun token da rinnovare adesso: o non scadono, o la scadenza è ancora lontana.
          </p>
        ) : (
          <ul className="elenco-esiti" style={{ marginTop: 10 }}>
            {righe.map((r) => (
              <li key={r.account}>
                <strong>{r.account}</strong> — {r.esito}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  )
}
