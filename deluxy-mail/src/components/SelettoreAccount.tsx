'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { impostaAccountAttivo } from '@/lib/actions'

/**
 * Il selettore della casella attiva (multi-account): «Tutte le caselle» oppure
 * una in particolare. Filtra la posta e diventa il mittente di default delle
 * mail nuove. Compare solo con più di una casella collegata.
 */
export function SelettoreAccount({
  caselle,
  attivo,
}: {
  caselle: { id: string; email: string }[]
  attivo: string | null
}) {
  const [inCorso, start] = useTransition()
  const router = useRouter()

  if (caselle.length < 2) return null

  const cambia = (id: string) =>
    start(async () => {
      await impostaAccountAttivo(id)
      router.refresh()
    })

  return (
    <div className="selettore-account">
      <label className="nav-label" style={{ padding: '0 0 4px' }}>
        Casella
      </label>
      <select
        value={attivo ?? 'tutti'}
        onChange={(e) => cambia(e.target.value)}
        disabled={inCorso}
        aria-label="Scegli la casella"
      >
        <option value="tutti">Tutte le caselle</option>
        {caselle.map((c) => (
          <option key={c.id} value={c.id}>
            {c.email}
          </option>
        ))}
      </select>
    </div>
  )
}
