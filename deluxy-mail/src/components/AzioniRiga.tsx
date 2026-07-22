'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  archiviaSenzaAggiornare,
  archiviaThreadSenzaAggiornare,
  archiviaDefinitivo,
  cestinaMessaggio,
  cestinaThread,
  ripristinaMessaggio,
  segnalaSpam,
  segnalaSpamThread,
} from '@/lib/actions'

/**
 * Archivia / Cestina / Spam direttamente dalla lista, senza aprire il messaggio.
 *
 * "Archivia" è UNO solo: archivia subito questa mail (reversibile, si rivede
 * negli Archiviati) e poi chiede se vale «per sempre» — cioè se archiviare anche
 * tutti i prossimi messaggi di quel mittente creando la regola. Così non ci sono
 * due bottoni (archivia / archivia definitivo): prima l'azione, poi la scelta.
 *
 * Ogni click va fermato (preventDefault): la riga è un link, altrimenti aprirebbe
 * la mail invece di eseguire l'azione.
 */
export function AzioniRiga({
  id,
  archiviato,
  cestinato,
  mittente,
  giaInSpam = false,
  perThread = false,
  onFatto,
}: {
  id: string
  archiviato: boolean
  cestinato: boolean
  /** Mittente: serve per la domanda «Sempre da …?» dopo l'archiviazione. */
  mittente?: string
  /** La mail è già nella sezione SPAM: niente bottone "Spam". */
  giaInSpam?: boolean
  /** In posta in arrivo la riga è un THREAD: archivia/cestina/spam agiscono su
   *  TUTTE le mail della conversazione, non solo sull'ultima (che altrimenti
   *  ricomparirebbe con un altro messaggio). */
  perThread?: boolean
  /** Chiamato quando la mail esce dalla lista (rimozione ottimistica). */
  onFatto?: () => void
}) {
  const [inCorso, startTransition] = useTransition()
  // Dopo aver archiviato, si chiede se rendere l'archiviazione permanente.
  const [chiediSempre, setChiediSempre] = useState(false)
  const router = useRouter()

  function ferma(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  // Azione che fa USCIRE la riga: sparisce subito, poi si riallinea il server.
  function eseguiEsci(e: React.MouseEvent, azione: () => Promise<unknown>) {
    ferma(e)
    onFatto?.()
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
        onClick={(e) => eseguiEsci(e, () => ripristinaMessaggio(id))}
      >
        Ripristina
      </button>
    )
  }

  // Fase 2: la mail è già archiviata, chiediamo se vale per sempre.
  if (chiediSempre) {
    return (
      <span className="archivia-def-conferma" onClick={ferma}>
        <span>
          Archiviata. Sempre da{' '}
          {mittente ? <strong>{mittente}</strong> : 'questo mittente'}?
        </span>
        <button
          type="button"
          className="archivia-def"
          disabled={inCorso}
          title="Solo questa mail (resta negli Archiviati)"
          onClick={(e) => {
            ferma(e)
            onFatto?.()
            startTransition(async () => {
              router.refresh()
            })
          }}
        >
          No, solo questa
        </button>
        <button
          type="button"
          className="archivia-def si"
          disabled={inCorso}
          title={`Archivia anche tutti i prossimi messaggi da ${mittente ?? 'questo mittente'}, creando una regola`}
          onClick={(e) => {
            ferma(e)
            startTransition(async () => {
              await archiviaDefinitivo(id)
              onFatto?.()
              router.refresh()
            })
          }}
        >
          {inCorso ? 'Creo la regola…' : 'Sì, sempre'}
        </button>
      </span>
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
          onClick={(e) => {
            ferma(e)
            // Archivia subito (SENZA refresh: altrimenti la lista si aggiorna e
            // la riga con la domanda sparisce), poi chiedi se per sempre. Il
            // refresh lo si fa dopo la risposta.
            startTransition(async () => {
              await (perThread ? archiviaThreadSenzaAggiornare(id) : archiviaSenzaAggiornare(id))
              setChiediSempre(true)
            })
          }}
        >
          Archivia
        </button>
      )}
      <button
        type="button"
        className="azione-riga"
        disabled={inCorso}
        title="Sposta nel cestino di AI Mail (la mail resta sul server)"
        onClick={(e) => eseguiEsci(e, () => (perThread ? cestinaThread(id) : cestinaMessaggio(id)))}
      >
        Cestina
      </button>
      {!giaInSpam && (
        <button
          type="button"
          className="azione-riga"
          disabled={inCorso}
          title="Sposta nello SPAM (posta indesiderata)"
          onClick={(e) => eseguiEsci(e, () => (perThread ? segnalaSpamThread(id) : segnalaSpam(id)))}
        >
          Spam
        </button>
      )}
    </>
  )
}
