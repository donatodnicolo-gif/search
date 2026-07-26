'use client'

import { useState } from 'react'

// Prova le credenziali SMTP salvate, senza inviare posta a nessuno.
// Sta fuori dal form delle impostazioni: prima si salva, poi si prova.
export function ProvaEmail() {
  const [stato, setStato] = useState<'fermo' | 'provo'>('fermo')
  const [esito, setEsito] = useState<{ ok: boolean; messaggio: string } | null>(null)

  async function prova() {
    setStato('provo')
    setEsito(null)
    try {
      const res = await fetch('/api/email/prova', { method: 'POST' })
      setEsito((await res.json()) as { ok: boolean; messaggio: string })
    } catch {
      setEsito({ ok: false, messaggio: 'Prova non riuscita: problema di rete.' })
    } finally {
      setStato('fermo')
    }
  }

  return (
    <div style={{ marginTop: 4 }}>
      <button type="button" className="bottone secondario" onClick={prova} disabled={stato === 'provo'}>
        {stato === 'provo' ? 'Provo…' : 'Prova la connessione'}
      </button>
      {esito ? (
        <p
          style={{
            fontSize: 13,
            marginBottom: 0,
            color: esito.ok ? 'var(--green)' : 'var(--red)',
          }}
        >
          {esito.messaggio}
        </p>
      ) : null}
    </div>
  )
}
