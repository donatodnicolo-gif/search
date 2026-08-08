'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { preparaRispostaAI } from '@/lib/actions'
import { mostraFlash } from './Flash'

/**
 * **R+** — «scrivimi la risposta»: sta accanto alle priorità e fa preparare a
 * Renè la bozza, poi apre la schermata di scrittura con la bozza dentro.
 *
 * ⚠️ Esiste perché la bozza è stata STACCATA dalla priorità (7/08/2026): dare
 * un P0 significa «questa è urgente», e faceva anche partire una risposta
 * preparata. Un gesto, due effetti — e chi stava solo classificando la posta si
 * ritrovava bozze mai chieste. Ora sono due tasti vicini: quello che dice
 * quanto è urgente, e quello che chiede la risposta.
 * ⚠️ Sta dentro un link (la riga apre la mail): il clic va fermato, o invece
 * della bozza si apre il messaggio.
 */
export function BottoneRispostaAI({ id }: { id: string }) {
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const chiedi = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    start(async () => {
      const r = await preparaRispostaAI(id)
      if (!r.ok) {
        mostraFlash(r.messaggio)
        return
      }
      mostraFlash(r.messaggio)
      // La bozza è pronta: si va dove si legge e si corregge prima di mandare.
      if (r.vaiA) router.push(r.vaiA)
      else router.refresh()
    })
  }

  return (
    <button
      type="button"
      className="prio-btn risposta-ai"
      disabled={inCorso}
      onClick={chiedi}
      title="Fai scrivere a Renè la bozza di risposta (poi la correggi tu)"
      aria-label="Prepara la risposta con l’AI"
    >
      {inCorso ? '…' : 'R+'}
    </button>
  )
}
