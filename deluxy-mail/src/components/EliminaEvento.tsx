'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { eliminaEvento } from '@/lib/actions'

/** Elimina un appuntamento (con conferma: non si torna indietro). */
export function EliminaEvento({ id }: { id: string }) {
  const [inCorso, start] = useTransition()
  const router = useRouter()

  return (
    <button
      type="button"
      className="azione-riga"
      disabled={inCorso}
      onClick={() => {
        if (!window.confirm('Eliminare questo appuntamento?')) return
        start(async () => {
          await eliminaEvento(id)
          router.refresh()
        })
      }}
    >
      Elimina
    </button>
  )
}
