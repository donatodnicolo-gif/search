'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { rimettiInPostaMassa } from '@/lib/actions'
import { mostraFlash } from './Flash'

/**
 * «Ripristina tutte quelle che vedi» dal Cestino.
 *
 * ⚠️⚠️ Perché esiste: la distruzione era **in blocco** e il recupero **uno alla
 * volta**. Dalla posta in arrivo una spunta e un bottone mandano nel cestino
 * centinaia di conversazioni in un colpo; qui si ripristinava un messaggio per
 * volta, con un clic ciascuno. Un'asimmetria così non è una scomodità: rende
 * *di fatto* irreversibile un gesto che sulla carta è reversibile — ed è la
 * ragione per cui l'azione di massa, dall'altra parte, ora chiede conferma.
 *
 * ⚠️ Chiede conferma anche questo, ma per un motivo diverso: rimettere in posta
 * duecento mail vecchie riempie la posta in arrivo, e chi apre il cestino per
 * cercarne UNA non deve farlo per sbaglio.
 */
export function RipristinaCestino({ ids }: { ids: string[] }) {
  const [conferma, setConferma] = useState(false)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  if (ids.length === 0) return null

  const ripristina = () =>
    start(async () => {
      try {
        const r = await rimettiInPostaMassa(ids)
        mostraFlash(r.messaggio, r.ok ? 'ok' : 'errore')
        setConferma(false)
        if (r.ok) router.refresh()
      } catch {
        mostraFlash('Non è arrivata risposta: le mail sono ancora nel cestino.', 'errore')
      }
    })

  if (conferma) {
    return (
      <div className="riga-azioni" style={{ gap: '6px 12px', alignItems: 'center' }}>
        <span style={{ fontSize: 13.5 }}>
          Rimetto in posta <strong>{ids.length}</strong> {ids.length === 1 ? 'messaggio' : 'messaggi'}?
        </span>
        <button type="button" className="btn primary small" disabled={inCorso} onClick={ripristina}>
          Sì, ripristina
        </button>
        <button type="button" className="btn secondary small" disabled={inCorso} onClick={() => setConferma(false)}>
          Annulla
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      className="btn secondary small"
      disabled={inCorso}
      onClick={() => setConferma(true)}
      title="Rimette in posta in arrivo tutti i messaggi elencati qui sotto"
    >
      ↩ Ripristina tutti ({ids.length})
    </button>
  )
}
