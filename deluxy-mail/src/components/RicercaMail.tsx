'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * La barra di ricerca della posta: cerca fra RICEVUTE e INVIATE (mittente,
 * destinatario, oggetto, testo). Invia a /?q=… ; il ramo di ricerca è nella
 * pagina della posta.
 */
export function RicercaMail({ iniziale = '' }: { iniziale?: string }) {
  const [q, setQ] = useState(iniziale)
  const router = useRouter()

  const cerca = () => {
    const v = q.trim()
    router.push(v.length >= 2 ? `/?q=${encodeURIComponent(v)}` : '/')
  }

  return (
    <form
      className="ricerca-mail"
      onSubmit={(e) => {
        e.preventDefault()
        cerca()
      }}
    >
      <span className="ricerca-icona" aria-hidden>
        ⌕
      </span>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cerca nella posta (ricevute e inviate)…"
        aria-label="Cerca nella posta"
      />
      {iniziale && (
        <button
          type="button"
          className="ricerca-pulisci"
          aria-label="Azzera la ricerca"
          onClick={() => {
            setQ('')
            router.push('/')
          }}
        >
          ✕
        </button>
      )}
    </form>
  )
}
