'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cambiaContattoAI } from '@/lib/actions'

/**
 * Il "PLUS AI" su un contatto: attivo = le sue mail entrano nella AI Inbox e
 * l'AI ne fa il quadro. Un click commuta lo stato.
 */
export function BottoneContattoAI({
  email,
  attivo,
  piccolo = false,
}: {
  email: string
  attivo: boolean
  piccolo?: boolean
}) {
  const [stato, setStato] = useState(attivo)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const commuta = () =>
    start(async () => {
      const nuovo = !stato
      setStato(nuovo) // ottimistico
      const esito = await cambiaContattoAI(email, nuovo)
      if (!esito.ok) setStato(!nuovo)
      router.refresh()
    })

  return (
    <button
      type="button"
      onClick={commuta}
      disabled={inCorso}
      className={`ai-toggle ${stato ? 'on' : ''} ${piccolo ? 'small' : ''}`}
      title={
        stato
          ? 'Contatto AI attivo — clic per togliere il PLUS AI'
          : 'Aggiungi il PLUS AI: le sue mail vanno nella AI Inbox e l’AI ne fa il quadro'
      }
    >
      <span className="ai-toggle-mark">AI</span>
      <span>{stato ? 'Attivo' : '+ AI'}</span>
    </button>
  )
}
