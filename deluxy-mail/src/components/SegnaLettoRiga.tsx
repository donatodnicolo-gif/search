'use client'

import { useState, useTransition } from 'react'
import { segnaLettoThread } from '@/lib/actions'

/**
 * «Letto» / «Non letto» direttamente dalla riga della posta, senza aprire la
 * mail. In posta in arrivo una riga è una CONVERSAZIONE, quindi agisce su
 * tutte le sue mail: marcare solo la più recente lascerebbe acceso il pallino.
 *
 * ⚠️ Il pallino si spegne al CLIC, non a fine giro: lo stato è locale e
 * ottimistico e torna indietro se il salvataggio non riesce. La riga è dentro
 * un link, quindi ogni clic va fermato (preventDefault) o si aprirebbe la mail.
 */
export function SegnaLettoRiga({
  id,
  nonLetto,
  onCambio,
}: {
  id: string
  nonLetto: boolean
  /** Per far spegnere il pallino alla riga che ci sta intorno. */
  onCambio?: (letto: boolean) => void
}) {
  const [daLeggere, setDaLeggere] = useState(nonLetto)
  const [inCorso, start] = useTransition()

  const cambia = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const nuovo = daLeggere // se era da leggere, ora diventa letta
    setDaLeggere(!daLeggere)
    onCambio?.(nuovo)
    start(async () => {
      const r = await segnaLettoThread(id, nuovo)
      if (!r.ok) {
        setDaLeggere(daLeggere)
        onCambio?.(!nuovo)
      }
    })
  }

  return (
    <button
      type="button"
      className="azione-riga"
      disabled={inCorso}
      onClick={cambia}
      title={
        daLeggere
          ? 'Segna come letto tutta la conversazione (senza aprirla)'
          : 'Rimettila fra le non lette'
      }
    >
      {daLeggere ? '✓ Letto' : 'Non letto'}
    </button>
  )
}
