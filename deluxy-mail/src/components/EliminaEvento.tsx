'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { eliminaEvento } from '@/lib/actions'

/** Elimina un appuntamento (con conferma: non si torna indietro).
 *  `className` ed `etichetta` servono dove l'azione sta in una riga di pillole
 *  invece che fra i link di una riga — stessa logica, un solo posto. */
export function EliminaEvento({
  id,
  className = 'azione-riga',
  etichetta = 'Elimina',
}: {
  id: string
  className?: string
  etichetta?: string
}) {
  const [inCorso, start] = useTransition()
  const router = useRouter()

  return (
    <button
      type="button"
      className={className}
      disabled={inCorso}
      onClick={() => {
        if (!window.confirm('Eliminare questo appuntamento?')) return
        start(async () => {
          await eliminaEvento(id)
          router.refresh()
        })
      }}
    >
      {etichetta}
    </button>
  )
}
