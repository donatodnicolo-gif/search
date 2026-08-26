'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { decidiSpamCaso } from '@/lib/actions'
import { mostraFlash } from './Flash'

/**
 * La decisione «è spam?» presa DALL'ELENCO DELLE ATTIVITÀ, senza aprire la mail.
 *
 * ⚠️ Sostituisce «Esegui» su queste attività, e non è un dettaglio estetico:
 * «Esegui» significa «l'AI scrive la mail che chiude il compito», e su una
 * richiesta di approvazione ha aperto **una bozza di risposta a una mail di
 * phishing** (segnalato il 7/08/2026). Un tasto che fa la cosa giusta il 95%
 * delle volte, sul restante 5% non va corretto: va tolto.
 *
 * Decidendo «sì» si sposta in SPAM **tutta la casistica** in attesa, non la
 * singola mail — è il senso di «e fallo sempre».
 */
export function DecidiSpamRiga({ messaggioId }: { messaggioId: string }) {
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const decidi = (decisione: 'approva' | 'rifiuta') =>
    start(async () => {
      const r = await decidiSpamCaso(messaggioId, decisione)
      mostraFlash(r.messaggio, r.ok ? 'ok' : 'errore')
      router.refresh()
    })

  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        type="button"
        className="azione-riga"
        disabled={inCorso}
        title="Manda in SPAM questa e tutte le prossime uguali"
        onClick={() => decidi('approva')}
      >
        {inCorso ? '…' : 'Sì, è spam'}
      </button>
      <button
        type="button"
        className="azione-riga"
        disabled={inCorso}
        title="Lasciala in posta e non chiedermelo più per questa casistica"
        onClick={() => decidi('rifiuta')}
      >
        No, è buona
      </button>
    </span>
  )
}
