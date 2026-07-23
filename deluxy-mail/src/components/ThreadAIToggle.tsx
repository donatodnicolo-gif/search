'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cambiaThreadAI } from '@/lib/actions'
import { mostraFlash } from './Flash'

/**
 * PLUS AI sulla CONVERSAZIONE: acceso, l'AI legge sempre le mail di questo
 * thread (anche senza dargli una priorità) e la conversazione entra nella AI
 * Inbox. È il gemello del PLUS AI sui contatti, ma legato allo scambio invece
 * che alla persona: utile quando la trattativa conta, non il mittente.
 */
export function ThreadAIToggle({ messaggioId, attivo }: { messaggioId: string; attivo: boolean }) {
  const [acceso, setAcceso] = useState(attivo)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const cambia = () =>
    start(async () => {
      const nuovo = !acceso
      const esito = await cambiaThreadAI(messaggioId, nuovo)
      if (esito.ok) {
        setAcceso(nuovo)
        mostraFlash(esito.messaggio)
        router.refresh()
      } else {
        mostraFlash(esito.messaggio)
      }
    })

  return (
    <button
      type="button"
      className={acceso ? 'btn primary small' : 'btn secondary small'}
      onClick={cambia}
      disabled={inCorso}
      title={
        acceso
          ? 'L’AI legge sempre questa conversazione. Clicca per togliere il PLUS AI.'
          : 'Fai leggere sempre questa conversazione all’AI (entra anche nella AI Inbox).'
      }
    >
      {inCorso ? '…' : acceso ? '✓ AI+ attivo' : '+ AI su questa conversazione'}
    </button>
  )
}
