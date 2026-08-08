'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { segnaAttivitaTutte } from '@/lib/actions'
import { mostraFlash } from './Flash'

/**
 * **✓ Fatte tutte (N)** sull'intestazione di un gruppo di attività.
 *
 * ⚠️ Perché serve: la stessa conversazione genera spesso più volte la stessa
 * cosa da fare — cinque «Fissare un incontro con Martina Calia» nate da cinque
 * messaggi dello stesso scambio — e spuntarle una per una è lavoro inventato.
 * ⚠️ **Chiede conferma**, ma solo una volta e sul posto: il tasto diventa
 * «Sicuro? Chiudi le 5». Chiudere cinque cose con un clic distratto è facile,
 * e chi non voleva farlo se ne accorge quando la lista è già vuota. (Riaprirle
 * si può, una per una, da «Fatte di recente» — ma è comunque un fastidio.)
 */
export function ChiudiTutteAttivita({ ids }: { ids: string[] }) {
  const [conferma, setConferma] = useState(false)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  if (ids.length < 2) return null

  const chiudi = () =>
    start(async () => {
      const r = await segnaAttivitaTutte(ids, true)
      setConferma(false)
      mostraFlash(r.ok ? `${r.quante} cose da fare chiuse.` : 'Non è riuscito: riprova.')
      router.refresh()
    })

  return conferma ? (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <button type="button" className="azione-riga" onClick={chiudi} disabled={inCorso}>
        {inCorso ? 'Chiudo…' : `Sicuro? Chiudi le ${ids.length}`}
      </button>
      <button type="button" className="azione-riga" onClick={() => setConferma(false)} disabled={inCorso}>
        No
      </button>
    </span>
  ) : (
    <button
      type="button"
      className="azione-riga"
      onClick={() => setConferma(true)}
      title="Segna fatte tutte le cose da fare di questa conversazione"
    >
      ✓ Fatte tutte ({ids.length})
    </button>
  )
}
