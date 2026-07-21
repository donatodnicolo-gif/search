'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Ricerca contatti. Cerca mentre scrivi, ma con mezzo secondo di attesa:
 * senza, ogni lettera farebbe una query al database.
 */
export function CercaContatti({ valore }: { valore: string }) {
  const [testo, setTesto] = useState(valore)
  const router = useRouter()

  useEffect(() => {
    if (testo === valore) return
    const id = setTimeout(() => {
      router.push(testo.trim() ? `/rubrica?q=${encodeURIComponent(testo.trim())}` : '/rubrica')
    }, 500)
    return () => clearTimeout(id)
  }, [testo, valore, router])

  return (
    <input
      type="text"
      value={testo}
      onChange={(e) => setTesto(e.target.value)}
      placeholder="Cerca un contatto per nome o indirizzo…"
      aria-label="Cerca contatti"
      style={{ width: '100%', maxWidth: 520, padding: '11px 16px', fontSize: 14 }}
    />
  )
}
