'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { segnalaNonSpam } from '@/lib/actions'
import { mostraFlash } from './Flash'

/**
 * "Non è spam": riporta la mail in Posta in arrivo. Si mostra solo sulle mail
 * che sono finite nella sezione SPAM.
 */
export function BottoneNonSpam({ id }: { id: string }) {
  const [inCorso, start] = useTransition()
  const router = useRouter()

  return (
    <button
      type="button"
      className="azione-riga"
      disabled={inCorso}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        start(async () => {
          const r = await segnalaNonSpam(id)
          mostraFlash(r.messaggio)
          router.refresh()
        })
      }}
    >
      {inCorso ? '…' : 'Non è spam'}
    </button>
  )
}
