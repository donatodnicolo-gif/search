'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { segnaAttivita } from '@/lib/actions'
import { mostraFlash } from './Flash'

/**
 * **↩ Riapri**: rimette fra le cose da fare un'attività già chiusa.
 *
 * ⚠️ Si poteva già fare togliendo la spunta, ma nessuno lo trovava: in
 * «Fatte di recente» la casella è spuntata e barrata, e ha tutta l'aria di un
 * archivio in sola lettura. Segnalato il 7/08/2026 («consentimi di riaprire una
 * task»). Un tasto scritto costa una riga e toglie il dubbio — stessa storia
 * delle scorciatoie e del link alla mail nelle attività.
 * ⚠️ Ricarica dopo il salvataggio: l'attività deve tornare **su**, nel suo
 * gruppo. Senza, resterebbe qui in mezzo alle fatte e sembrerebbe non aver
 * funzionato.
 */
export function RiapriAttivita({ id }: { id: string }) {
  const [inCorso, start] = useTransition()
  const router = useRouter()

  return (
    <button
      type="button"
      className="azione-riga"
      disabled={inCorso}
      title="Rimettila fra le cose da fare"
      onClick={() =>
        start(async () => {
          try {
            await segnaAttivita(id, false)
            mostraFlash('Riaperta: è tornata fra le cose da fare.')
            router.refresh()
          } catch {
            mostraFlash('Non è riuscito: riprova fra poco.')
          }
        })
      }
    >
      {inCorso ? '…' : '↩ Riapri'}
    </button>
  )
}
