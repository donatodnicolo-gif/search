'use client'

import { useState } from 'react'

// Prova SMTP e IMAP di una casella salvata, senza inviare posta a nessuno.
// La prova legge dal database: va premuta DOPO aver salvato.
export function ProvaCasella({ id }: { id: string }) {
  const [provo, setProvo] = useState(false)
  const [esito, setEsito] = useState<{ ok: boolean; messaggio: string } | null>(null)

  async function prova() {
    setProvo(true)
    setEsito(null)
    try {
      const res = await fetch('/api/email/prova', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setEsito((await res.json()) as { ok: boolean; messaggio: string })
    } catch {
      setEsito({ ok: false, messaggio: 'Prova non riuscita: problema di rete.' })
    } finally {
      setProvo(false)
    }
  }

  return (
    <>
      <button type="button" className="btn btn-secondario small" onClick={prova} disabled={provo}>
        {provo ? 'Provo…' : 'Prova la connessione'}
      </button>
      {esito ? (
        <span style={{ fontSize: 12.5, color: esito.ok ? 'var(--green)' : 'var(--red)' }}>
          {esito.messaggio}
        </span>
      ) : null}
    </>
  )
}
