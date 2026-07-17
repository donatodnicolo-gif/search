'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { archiviaMessaggio, cestinaMessaggio, ripristinaMessaggio } from '@/lib/actions'

/**
 * Archivia / Cestina direttamente dalla lista, senza aprire il messaggio.
 *
 * Entrambe sono reversibili — l'archiviato si rivede col filtro "Archiviati",
 * il cestinato si ripristina dal Cestino — quindi non chiedono conferma:
 * un'azione che si disfa con un click non merita un passaggio in più.
 * "Archivia definitivo" invece la chiede, perché crea una regola permanente.
 */
export function AzioniRiga({
  id,
  archiviato,
  cestinato,
}: {
  id: string
  archiviato: boolean
  cestinato: boolean
}) {
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  function esegui(e: React.MouseEvent, azione: () => Promise<void>) {
    // La riga è un link: senza fermare il click si aprirebbe la mail.
    e.preventDefault()
    e.stopPropagation()
    startTransition(async () => {
      await azione()
      router.refresh()
    })
  }

  if (cestinato) {
    return (
      <button
        type="button"
        className="azione-riga"
        disabled={inCorso}
        onClick={(e) => esegui(e, () => ripristinaMessaggio(id))}
      >
        Ripristina
      </button>
    )
  }

  return (
    <>
      {!archiviato && (
        <button
          type="button"
          className="azione-riga"
          disabled={inCorso}
          title="Togli dalla posta in arrivo (resta negli Archiviati)"
          onClick={(e) => esegui(e, () => archiviaMessaggio(id))}
        >
          Archivia
        </button>
      )}
      <button
        type="button"
        className="azione-riga"
        disabled={inCorso}
        title="Sposta nel cestino di AI Mail (la mail resta sul server)"
        onClick={(e) => esegui(e, () => cestinaMessaggio(id))}
      >
        Cestina
      </button>
    </>
  )
}
