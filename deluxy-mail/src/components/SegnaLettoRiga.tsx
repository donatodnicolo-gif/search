'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { azioneMassa } from '@/lib/actions'

/**
 * «Letto» / «Non letto» direttamente dalla riga della posta, senza aprire la
 * mail. In posta in arrivo una riga è una CONVERSAZIONE, quindi agisce su
 * tutte le sue mail: marcare solo la più recente lascerebbe acceso il pallino.
 *
 * ⚠️ **Nessuno stato qui dentro, ed è il punto**: prima questo tasto teneva un
 * suo `useState(nonLetto)`, inizializzato al primo render e mai più aggiornato.
 * Risultato visto il 7/08/2026: la riga mostrava il pallino BLU (il suo stato
 * si era riallineato al server) e il tasto diceva «Non letto» (il suo no) —
 * due pezzi della stessa riga che si contraddicevano. Una sola verità: quella
 * della riga, che arriva dal server e che qui si cambia con `onCambio`.
 * ⚠️ Il pallino si spegne comunque al CLIC e non a fine giro: l'aggiornamento
 * ottimistico lo fa la riga, e se il salvataggio fallisce si torna indietro.
 * La riga è dentro un link, quindi ogni clic va fermato (preventDefault) o si
 * aprirebbe la mail.
 */
export function SegnaLettoRiga({
  ids,
  nonLetto,
  onCambio,
}: {
  /** TUTTE le mail che la riga rappresenta: si agisce su quelle e basta. */
  ids: string[]
  nonLetto: boolean
  /** Cambia lo stato nella riga che ci sta intorno: è lì che vive. */
  onCambio: (letto: boolean) => void
}) {
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const cambia = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const nuovo = nonLetto // se era da leggere, ora diventa letta
    onCambio(nuovo)
    start(async () => {
      const r = await azioneMassa(ids, nuovo ? 'letto' : 'nonletto')
      if (!r.ok) {
        onCambio(!nuovo)
        return
      }
      // ⚠️ Qui il refresh CI VUOLE, ed è un'eccezione alla regola «niente
      // refresh dopo un'azione di riga» (§9): quella regola vale dove la riga
      // SPARISCE — archivia, cestina — e allora a schermo non resta niente di
      // sbagliato. Qui la riga resta, e i contatori della colonna di sinistra
      // continuerebbero a contare come non letta una mail che hai appena
      // segnato letta: due numeri diversi per la stessa cosa. Segnalato il
      // 7/08/2026.
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      className="azione-riga"
      disabled={inCorso}
      onClick={cambia}
      title={
        nonLetto
          ? 'Segna come letto tutta la conversazione (senza aprirla)'
          : 'Rimettila fra le non lette'
      }
    >
      {nonLetto ? '✓ Letto' : 'Non letto'}
    </button>
  )
}
